package expo.modules.digesthttp

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Authenticator
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
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

    /** Быстрая проверка доступности адреса — нужна, чтобы выбрать локальный или внешний. */
    AsyncFunction("probe") { url: String, timeoutMs: Int ->
      RouterClient.probe(url, timeoutMs)
    }
  }
}

/**
 * Обычная HTTP Digest-авторизация (RFC 2617/7616).
 *
 * Нужна для доступа через KeenDNS-облако: в отличие от домашней сети, облако
 * не передаёт заголовки `X-NDM-Realm`/`X-NDM-Challenge`, по которым работает
 * схема NDW2, а отвечает стандартным `WWW-Authenticate: Digest ...`.
 *
 * Поддерживаются MD5, MD5-sess, SHA-256 и SHA-256-sess, а также `qop=auth`
 * (с nonce-count) и `auth-int`. Учётные данные подставляет OkHttp через
 * `Credentials` из запроса.
 */
/** Учётные данные, привязанные к запросу (тег), чтобы их увидел Authenticator. */
private data class RouterCredentials(val user: String, val pass: String)

private class DigestAuthenticator : Authenticator {
  private val nonceCount = AtomicInteger(1)

  override fun authenticate(route: Route?, response: Response): Request? {
    // Повторяем только один раз на запрос — иначе возможен бесконечный цикл.
    if (responseCount(response) >= 2) return null

    val credentials = response.request.tag(RouterCredentials::class.java) ?: return null

    val header = response.headers("WWW-Authenticate")
      .firstOrNull { it.trim().startsWith("Digest", ignoreCase = true) }
      ?: return null

    val params = parseChallenge(header)
    val realm = params["realm"] ?: return null
    val nonce = params["nonce"] ?: return null

    val algorithm = (params["algorithm"] ?: "MD5").uppercase()
    val opaque = params["opaque"]
    val qopOptions = params["qop"]?.split(',')?.map { it.trim().lowercase() } ?: emptyList()
    val qop = when {
      qopOptions.contains("auth") -> "auth"
      qopOptions.contains("auth-int") -> "auth-int"
      else -> null
    }

    val user = credentials.user
    val pass = credentials.pass

    val uri = response.request.url.encodedPath +
      (response.request.url.encodedQuery?.let { "?$it" } ?: "")

    val method = response.request.method

    // cnonce нужен и для qop, и для схем *-SESS, поэтому считаем его заранее.
    val cnonce = newCnonce()
    val isSess = algorithm.endsWith("-SESS")
    val baseAlgorithm = if (isSess) algorithm.removeSuffix("-SESS") else algorithm
    fun digestFn(input: String): String = hash(baseAlgorithm, input)

    val ha1 = if (isSess) {
      digestFn("${digestFn("$user:$realm:$pass")}:$nonce:$cnonce")
    } else {
      digestFn("$user:$realm:$pass")
    }

    val ha2 = if (qop == "auth-int") {
      // Тело хешируется как есть, сырыми байтами.
      val entity = response.request.body?.let { body ->
        val buffer = okio.Buffer()
        body.writeTo(buffer)
        hashBytes(baseAlgorithm, buffer.readByteArray())
      } ?: hash(baseAlgorithm, "")
      digestFn("$method:$uri:$entity")
    } else {
      digestFn("$method:$uri")
    }

    val nc = String.format("%08x", nonceCount.getAndIncrement())

    val digestValue = if (qop != null) {
      digestFn("$ha1:$nonce:$nc:$cnonce:$qop:$ha2")
    } else {
      digestFn("$ha1:$nonce:$ha2")
    }

    val authValue = buildString {
      append("Digest username=\"").append(quote(user)).append("\", ")
      append("realm=\"").append(quote(realm)).append("\", ")
      append("nonce=\"").append(quote(nonce)).append("\", ")
      append("uri=\"").append(uri).append("\", ")
      append("response=\"").append(digestValue).append("\"")
      if (algorithm.isNotEmpty()) append(", algorithm=").append(algorithm)
      if (opaque != null) append(", opaque=\"").append(quote(opaque)).append("\"")
      if (qop != null) {
        append(", qop=").append(qop)
        append(", nc=").append(nc)
        append(", cnonce=\"").append(cnonce).append("\"")
      }
    }

    return response.request.newBuilder()
      .header("Authorization", authValue)
      .build()
  }

  /** Сколько раз запрос уже повторяли с этой авторизацией. */
  private fun responseCount(response: Response): Int {
    var count = 1
    var prior = response.priorResponse
    while (prior != null) {
      count++
      prior = prior.priorResponse
    }
    return count
  }

  private fun parseChallenge(header: String): Map<String, String> {
    val out = HashMap<String, String>()
    val body = header.substringAfter(' ', "")
    val regex = Regex("""([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"|([A-Za-z0-9_-]+)\s*=\s*([^,\s]+)""")
    for (m in regex.findAll(body)) {
      val key = (if (m.groupValues[1].isNotEmpty()) m.groupValues[1] else m.groupValues[3]).lowercase()
      val value = if (m.groupValues[2].isNotEmpty()) m.groupValues[2] else m.groupValues[4]
      if (key.isNotEmpty()) out[key] = value
    }
    return out
  }

  private fun hash(algorithm: String, input: String): String =
    hashBytes(algorithm, input.toByteArray(Charsets.UTF_8))

  private fun hashBytes(algorithm: String, input: ByteArray): String {
    val name = when {
      algorithm.contains("SHA-512") -> "SHA-512"
      algorithm.contains("SHA-256") -> "SHA-256"
      else -> "MD5"
    }
    return MessageDigest.getInstance(name).digest(input).joinToString("") { "%02x".format(it) }
  }

  private fun newCnonce(): String {
    val bytes = ByteArray(8)
    SecureRandom().nextBytes(bytes)
    return bytes.joinToString("") { "%02x".format(it) }
  }

  private fun quote(v: String): String = v.replace("\\", "\\\\").replace("\"", "\\\"")
}

private object RouterClient {
  private val JSON = "application/json; charset=utf-8".toMediaType()

  /** Ориги, на которых текущая сессия уже подтверждена. */
  private val authedOrigins: MutableSet<String> = ConcurrentHashMap.newKeySet()

  /** Ориги, где роутер отвечает обычным HTTP Digest (KeenDNS-облако). */
  private val digestOnlyOrigins: MutableSet<String> = ConcurrentHashMap.newKeySet()

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
      init(null, arrayOf<javax.net.ssl.TrustManager>(trustAll), SecureRandom())
    }
    OkHttpClient.Builder()
      .cookieJar(cookieJar)
      // Авторизация через KeenDNS-облако идёт обычной HTTP Digest-схемой,
      // а не NDW2 с заголовками X-NDM-*: облако их не пропускает.
      .authenticator(DigestAuthenticator())
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

  /** Адрес, на котором реально оказался запрос после редиректов. */
  private fun describeRedirect(original: HttpUrl, final: HttpUrl): String {
    val changedHost = original.host != final.host
    val changedScheme = original.scheme != final.scheme
    return when {
      changedHost && changedScheme -> "запрос перенаправлен на ${final.scheme}://${final.host}"
      changedHost -> "запрос перенаправлен на ${final.host}"
      changedScheme -> "запрос перенаправлен на ${final.scheme}"
      else -> ""
    }
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

    var response = execute(parsed, method, headers, body, user, pass)

    // 401 после первой попытки означает, что сессия NDW2 ещё не установлена
    // (или истекла) — авторизуемся и повторяем один раз.
    if (response.status == 401 && user.isNotEmpty() && !digestOnlyOrigins.contains(origin)) {
      authedOrigins.remove(origin)
      val authError = handshake(origin, user, pass)
      if (authError != null) return authError.toJs()
      response = execute(parsed, method, headers, body, user, pass)
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
    user: String = "",
    pass: String = "",
  ): HttpResult {
    return try {
      val builder = Request.Builder().url(url)
      headers.forEach { (k, v) -> builder.header(k, v) }
      // Учётные данные видны DigestAuthenticator через тег запроса.
      if (user.isNotEmpty()) builder.tag(RouterCredentials::class.java, RouterCredentials(user, pass))

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
      // Учётные данные в теге: если роутер ответит 401 с обычным Digest,
      // его обработает DigestAuthenticator и вернёт уже успешный ответ.
      val request = Request.Builder()
        .url(authUrl)
        .tag(RouterCredentials::class.java, RouterCredentials(user, pass))
        .get()
        .build()
      client.newCall(request).execute()
    } catch (e: Exception) {
      return networkFailure(e)
    }

    challengeResp.use { resp ->
      // 200 означает, что авторизация уже пройдена (есть сессионная кука)
      // либо пароль на роутере не задан. Второе нельзя принимать за успех
      // вслепую: при неверном пароле роутер тоже ответит 200, и вход прошёл бы
      // с любыми данными. Поэтому реальный запрос всё равно выполняется
      // вызывающей стороной и проверка пароля происходит по его результату.
      if (resp.code == 200) {
        authedOrigins.add(origin)
        return null
      }

      // Realm и challenge роутер отдаёт либо отдельными заголовками X-NDM-*,
      // либо строкой WWW-Authenticate (формат x-ndw2-interactive) — состав
      // заголовков у разных прошивок и способов доступа различается.
      //
      // Заголовков WWW-Authenticate может быть НЕСКОЛЬКО: KeeneticOS 5.x
      // перечисляет в них несколько схем (например x-ndw4-interactive и
      // x-ndw2-interactive). Берём именно ту, чью схему умеем обрабатывать,
      // иначе легко решить, что авторизация не поддерживается, хотя рядом
      // лежит рабочий вариант.
      val wwwList = resp.headers("WWW-Authenticate")
      val parsedList = wwwList.map { parseAuthHeader(it) }
      val ndw2 = parsedList.firstOrNull { (it["challenge"] ?: "").isNotEmpty() }
      val scheme = ndw2?.get("scheme") ?: parsedList.firstNotNullOfOrNull { it["scheme"] }

      val realm = resp.header("X-NDM-Realm") ?: ndw2?.get("realm")
      val challenge = resp.header("X-NDM-Challenge") ?: ndw2?.get("challenge")

      if (challenge == null) {
        // Схемы NDW2 нет, но роутер предлагает обычный HTTP Digest — так
        // отвечает KeenDNS-облако, не пропускающее заголовки X-NDM-*.
        // В этом случае не мешаем: запрос повторит DigestAuthenticator.
        val hasDigest = parsedList.any {
          (it["scheme"] ?: "").startsWith("Digest", ignoreCase = true)
        }
        if (hasDigest) {
          // Схема NDW2 здесь не применима: авторизацию выполняет
          // DigestAuthenticator, поэтому просто пропускаем запрос дальше.
          digestOnlyOrigins.add(origin)
          return null
        }

        // Диагностика: показываем, что реально ответил роутер, чтобы причину
        // было видно по тексту ошибки, а не догадываться.
        val present = resp.headers.names().joinToString(", ").lowercase()
        val schemes = parsedList.mapNotNull { it["scheme"] }.distinct()
        val redirect = describeRedirect(authUrl, resp.request.url)
        val hint = when {
          schemes.isNotEmpty() -> "роутер предлагает только схемы: ${schemes.joinToString(", ")}"
          wwwList.isNotEmpty() -> "заголовок WWW-Authenticate: ${wwwList.joinToString(" | ")}"
          resp.code == 401 -> "роутер не сообщил параметры авторизации"
          else -> "ответ HTTP ${resp.code}"
        }
        val where = if (redirect.isNotEmpty()) " ($redirect)" else ""
        return HttpResult(
          status = resp.code,
          headers = emptyMap(),
          body = "",
          error = "auth_not_supported",
          detail = "Авторизация недоступна$where: $hint. Заголовки ответа: $present",
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

  /**
   * Проверяет, отвечает ли роутер по адресу. Возвращает:
   *  - "ok"       — роутер ответил (в том числе 401: он жив и доступен);
   *  - "no_route" — адрес не разрешается или недоступен;
   *  - "timeout"  — ответа нет за отведённое время.
   */
  fun probe(url: String, timeoutMs: Int): Map<String, Any?> {
    val authUrl = url.toHttpUrlOrNull()
      ?: return mapOf("reachable" to false, "reason" to "no_route")

    val quick = client.newBuilder()
      .connectTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
      .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
      .writeTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
      .build()

    return try {
      val request = Request.Builder().url(authUrl).get().build()
      quick.newCall(request).execute().use { resp ->
        // Важно: у my.keenetic.net есть публичная DNS-запись, и вне домашней
        // сети запрос уходит не в роутер, а на внешнюю инфраструктуру (обычно
        // с перенаправлением на KeenDNS-имя). Такой ответ нельзя считать
        // доказательством, что мы дома, иначе приложение будет упорно
        // стучаться в локальный адрес.
        val finalHost = resp.request.url.host
        val redirectedAway = finalHost != authUrl.host

        val looksLikeRouter = resp.headers("X-NDM-Challenge").isNotEmpty() ||
          resp.headers("WWW-Authenticate").any {
            val l = it.lowercase()
            l.contains("ndw2") || l.contains("ndw4")
          }

        mapOf(
          "reachable" to true,
          "reason" to "ok",
          "status" to resp.code,
          "host" to finalHost,
          // Домашним считаем только прямой ответ самого роутера.
          "local" to (!redirectedAway && looksLikeRouter),
        )
      }
    } catch (e: Exception) {
      val reason = when {
        e is java.net.UnknownHostException -> "no_route"
        e is java.net.SocketTimeoutException -> "timeout"
        e is java.net.ConnectException -> "no_route"
        else -> "timeout"
      }
      mapOf("reachable" to false, "reason" to reason, "local" to false)
    }
  }

  /**
   * Разбирает строку WWW-Authenticate вида
   * `x-ndw2-interactive realm="Keenetic", challenge="...", session_id="..."`.
   * Возвращает map со scheme/realm/challenge (недостающие ключи отсутствуют).
   */
  private fun parseAuthHeader(value: String?): Map<String, String> {
    if (value.isNullOrBlank()) return emptyMap()
    val out = HashMap<String, String>()

    val space = value.indexOf(' ')
    val scheme = (if (space > 0) value.substring(0, space) else value).trim()
    if (scheme.isNotEmpty()) out["scheme"] = scheme
    if (space <= 0) return out

    // Пары key="value" или key=value через запятую.
    val regex = Regex("""([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"|([A-Za-z0-9_-]+)\s*=\s*([^,]+)""")
    for (m in regex.findAll(value.substring(space + 1))) {
      val key = (if (m.groupValues[1].isNotEmpty()) m.groupValues[1] else m.groupValues[3]).trim()
      val v = (if (m.groupValues[2].isNotEmpty()) m.groupValues[2] else m.groupValues[4]).trim()
      if (key.isNotEmpty()) out[key.lowercase().replace("-", "_")] = v
    }
    return out
  }

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