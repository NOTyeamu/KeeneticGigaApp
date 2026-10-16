package expo.modules.digesthttp

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * HTTP-клиент с авторизацией роутеров Keenetic по схеме NDW2
 * (`x-ndw2-interactive`).
 *
 * Схема, подтверждённая по независимым реализациям на Go, Python, TypeScript
 * и PowerShell:
 *
 *   1. GET  <origin>/auth без авторизации -> 401 и заголовки
 *      `X-NDM-Realm`, `X-NDM-Challenge` плюс `Set-Cookie` с сессионной кукой.
 *   2. md5hex = MD5(login + ":" + realm + ":" + password)   (hex, нижний регистр)
 *      auth   = SHA256(challenge + md5hex)                  (hex, нижний регистр)
 *   3. POST <origin>/auth  Content-Type: application/json
 *      {"login": login, "password": auth} — вместе с кукой из шага 1.
 *
 * Имя сессионной куки роутер выбирает случайно, поэтому здесь используется
 * настоящий CookieJar, а не захардкоженное имя. Сессия живёт 300 секунд и
 * продлевается каждым запросом, поэтому при ответе 401 клиент молча
 * переавторизуется и повторяет запрос один раз.
 */
class DigestHttpModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DigestHttp")

    AsyncFunction("fetch") { options: Map<String, Any?> ->
      val url = options["url"] as? String
        ?: throw IllegalArgumentException("Параметр url обязателен.")
      val method = ((options["method"] as? String) ?: "GET").uppercase()
      val user = options["user"] as? String ?: ""
      val pass = options["pass"] as? String ?: ""
      val body = options["body"] as? String

      @Suppress("UNCHECKED_CAST")
      val rawHeaders = options["headers"] as? Map<String, Any?> ?: emptyMap()
      val headers = rawHeaders.mapValues { it.value?.toString() ?: "" }

      RouterClient.request(url, method, user, pass, headers, body)
    }
  }
}

private object RouterClient {
  private val JSON = "application/json; charset=utf-8".toMediaType()

  /** Ориги, на которых текущая сессия уже подтверждена. */
  private val authedOrigins: MutableSet<String> = ConcurrentHashMap.newKeySet()

  private val cookieJar = object : CookieJar {
    private val store = ConcurrentHashMap<String, MutableList<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
      val list = store.getOrPut(url.host) { mutableListOf() }
      synchronized(list) {
        for (c in cookies) {
          list.removeAll { it.name == c.name }
          list.add(c)
        }
      }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
      val list = store[url.host] ?: return emptyList()
      synchronized(list) {
        val now = System.currentTimeMillis()
        list.removeAll { it.expiresAt < now }
        return list.toList()
      }
    }
  }

  /**
   * Роутеры отдают самоподписанные сертификаты, поэтому проверку цепочки
   * приходится отключить — иначе HTTPS-запрос к роутеру не пройдёт.
   */
  private val trustAll = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }

  private val client: OkHttpClient = run {
    val sslContext = SSLContext.getInstance("TLS").apply {
      init(null, arrayOf<javax.net.ssl.TrustManager>(trustAll), java.security.SecureRandom())
    }
    OkHttpClient.Builder()
      .cookieJar(cookieJar)
      .sslSocketFactory(sslContext.socketFactory, trustAll)
      .hostnameVerifier { _, _ -> true }
      .connectTimeout(20, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .writeTimeout(30, TimeUnit.SECONDS)
      .followRedirects(true)
      .followSslRedirects(true)
      .retryOnConnectionFailure(true)
      .build()
  }

  fun request(
    url: String,
    method: String,
    user: String,
    pass: String,
    headers: Map<String, String>,
    body: String?,
  ): Map<String, Any?> {
    val parsed = url.toHttpUrlOrNull()
      ?: return networkFailure(IllegalArgumentException("Некорректный адрес роутера.")).toJs()

    val scheme = parsed.scheme
    val port = parsed.port
    val origin = "$scheme://${parsed.host}${if (port != defaultPort(scheme)) ":$port" else ""}"

    // Первый запрос к роутеру — сразу авторизуемся, чтобы не тратить лишний 401.
    if (user.isNotEmpty() && !authedOrigins.contains(origin)) {
      val authError = handshake(origin, user, pass)
      if (authError != null) return authError.toJs()
    }

    var response = execute(parsed, method, headers, body)

    if (response.status == 401 && user.isNotEmpty()) {
      authedOrigins.remove(origin)
      val authError = handshake(origin, user, pass)
      if (authError != null) return authError.toJs()
      response = execute(parsed, method, headers, body)
    }

    return response.toJs()
  }

  private fun defaultPort(scheme: String): Int = if (scheme == "https") 443 else 80

  /** Результат одного HTTP-обмена, приводимый к виду, понятному JS. */
  private data class HttpResult(
    val status: Int,
    val headers: Map<String, String>,
    val body: String,
    val error: String? = null,
    val detail: String? = null,
  ) {
    val ok: Boolean get() = error == null && status in 200..299

    fun toJs(): Map<String, Any?> = mapOf(
      "ok" to ok,
      "status" to status,
      "headers" to headers,
      "body" to body,
      "error" to error,
      "detail" to detail,
    )
  }

  private fun execute(
    url: HttpUrl,
    method: String,
    headers: Map<String, String>,
    body: String?,
  ): HttpResult {
    return try {
      val builder = Request.Builder().url(url)
      headers.forEach { (k, v) -> builder.header(k, v) }

      val requestBody = when {
        body != null -> body.toRequestBody(JSON)
        method == "POST" || method == "PUT" || method == "PATCH" -> "{}".toRequestBody(JSON)
        else -> null
      }
      builder.method(method, requestBody)

      client.newCall(builder.build()).execute().use { resp ->
        val headerMap = HashMap<String, String>()
        for (name in resp.headers.names()) {
          val value = resp.header(name) ?: continue
          headerMap[name.lowercase()] = value
        }
        HttpResult(
          status = resp.code,
          headers = headerMap,
          body = resp.body?.string() ?: "",
        )
      }
    } catch (e: Exception) {
      networkFailure(e)
    }
  }

  /** Возвращает null при успехе либо готовый результат-ошибку. */
  private fun handshake(origin: String, user: String, pass: String): HttpResult? {
    val authUrl = "$origin/auth".toHttpUrlOrNull()
      ?: return networkFailure(IllegalArgumentException("Некорректный адрес роутера."))

    val challengeResp = try {
      val request = Request.Builder().url(authUrl).get().build()
      client.newCall(request).execute()
    } catch (e: Exception) {
      return networkFailure(e)
    }

    challengeResp.use { resp ->
      // Роутер без пароля отвечает 200 — авторизация не нужна.
      if (resp.code == 200) {
        authedOrigins.add(origin)
        return null
      }

      val realm = resp.header("X-NDM-Realm")
      val challenge = resp.header("X-NDM-Challenge")

      if (realm == null && challenge == null) {
        // KeenDNS-облако и часть прошивок отдают другие схемы (например
        // x-ndw4-interactive) — их мы не поддерживаем.
        return HttpResult(
          status = 401,
          headers = emptyMap(),
          body = "",
          error = "auth_not_supported",
          detail = "Роутер использует схему авторизации, которую приложение не поддерживает.",
        )
      }

      val md5Hex = md5Hex("$user:${realm ?: ""}:$pass")
      val authHash = sha256Hex("${challenge ?: ""}$md5Hex")

      val payload = """{"login":${jsonString(user)},"password":${jsonString(authHash)}}"""
      val postRequest = Request.Builder()
        .url(authUrl)
        .post(payload.toRequestBody(JSON))
        .build()

      val postResp = try {
        client.newCall(postRequest).execute()
      } catch (e: Exception) {
        return networkFailure(e)
      }

      postResp.use { pr ->
        if (pr.code == 401 || pr.code == 403) {
          return HttpResult(
            status = 401,
            headers = emptyMap(),
            body = "",
            error = "auth_failed",
            detail = "Не удалось авторизоваться на роутере. Проверьте логин и пароль.",
          )
        }
        if (pr.code !in 200..299) {
          return HttpResult(
            status = pr.code,
            headers = emptyMap(),
            body = "",
            error = "auth_failed",
            detail = "Роутер отклонил авторизацию (HTTP ${pr.code}).",
          )
        }
        authedOrigins.add(origin)
        return null
      }
    }
  }

  private fun networkFailure(e: Exception) = HttpResult(
    status = 0,
    headers = emptyMap(),
    body = "",
    error = "network",
    detail = describeNetworkError(e),
  )

  private fun describeNetworkError(e: Exception): String {
    val msg = e.message ?: ""
    return when {
      e is java.net.SocketTimeoutException || msg.contains("timeout", true) ->
        "Роутер не ответил за отведённое время."
      e is java.net.UnknownHostException ->
        "Не удалось найти роутер по указанному адресу. Проверьте подключение к сети."
      else -> "Не удалось подключиться к роутеру. Проверьте подключение к сети. ($msg)"
    }
  }

  private fun md5Hex(input: String): String {
    val digest = MessageDigest.getInstance("MD5").digest(input.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun sha256Hex(input: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun jsonString(value: String): String {
    val sb = StringBuilder("\"")
    for (ch in value) {
      when (ch) {
        '"' -> sb.append("\\\"")
        '\\' -> sb.append("\\\\")
        '\n' -> sb.append("\\n")
        '\r' -> sb.append("\\r")
        '\t' -> sb.append("\\t")
        else -> if (ch < ' ') sb.append("\\u%04x".format(ch.code)) else sb.append(ch)
      }
    }
    return sb.append('"').toString()
  }
}