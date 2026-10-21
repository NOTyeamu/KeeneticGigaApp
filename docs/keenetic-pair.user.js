// ==UserScript==
// @name         Keenetic Giga — вход с телефона
// @namespace    https://github.com/NOTyeamu/KeeneticGigaApp
// @version      2.1.0
// @description  Принимает данные роутера со страницы связки и сам входит в веб-интерфейс Keenetic
// @author       NOTyeamu
// @homepageURL  https://notyeamu.github.io/KeeneticGigaApp/pair.html
// @supportURL   https://github.com/NOTyeamu/KeeneticGigaApp/issues
//
// Домашние адреса роутера перечислены и через @match, и через @include.
//
// Это не избыточность, а страховка. В @match подстановка «*» допустима только
// первым или единственным символом хоста, поэтому шаблон http://192.168.*/*
// недействителен: Tampermonkey молча его игнорирует, и на странице роутера
// скрипт просто не запускается — именно с этим и была беда.
//
// В @include подстановка допустима в любом месте адреса, но проверить это на
// живом Tampermonkey я не могу, поэтому самые частые адреса продублированы
// явными @match — они работают наверняка. Скрипт запускается, если совпало
// хотя бы одно правило, так что дублирование безвредно.
// @match        http://192.168.0.1/*
// @match        http://192.168.1.1/*
// @match        http://192.168.0.1:*/*
// @match        http://192.168.1.1:*/*
// @match        http://10.0.0.1/*
// @include      http://192.168.*/*
// @include      http://10.*/*
// @include      http://172.16.*/*
// @include      http://172.17.*/*
// @include      http://172.18.*/*
// @include      http://172.19.*/*
// @include      http://my.keenetic.net/*
// @match        https://*.keenetic.link/*
// @match        https://*.keenetic.pro/*
// @match        https://*.keenetic.name/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
 * Зачем это нужно.
 *
 * Страница роутера — обычное приложение на http://, открытое с локального
 * адреса. Такой адрес браузер не считает защищённым контекстом, поэтому
 * войти «самим» приложение не может и вход всегда ручной. Этот скрипт
 * выполняется внутри страницы роутера — то есть в её собственном источнике —
 * и потому вправе обратиться к ней с данными для входа.
 *
 * Данные приходят от страницы связки сообщением. Отправляются они не отсюда
 * и никуда, кроме самого роутера, не уходят.
 *
 * Схема авторизации NDW2:
 *   md5Hex = MD5("логин:realm:пароль")
 *   ответ  = SHA256(challenge + md5Hex)
 * Обе величины — шестнадцатеричные строки в нижнем регистре.
 *
 * На странице роутера нет ни CryptoJS, ни WebCrypto (не защищённый контекст),
 * поэтому MD5 и SHA-256 реализованы здесь вручную.
 */

(function () {
  'use strict';

  var MSG_TYPE = 'keenetic-giga-pair';

  // От кого принимаем данные. Пустой список — принимать от любого источника,
  // но это ослабляет защиту: посторонняя страница смогла бы заставить окно
  // роутера войти под чужим аккаунтом.
  var ALLOWED_ORIGINS = ['https://notyeamu.github.io'];

  // Повторный вход после перезагрузки не нужен: страница сама увидит сессию.
  var DONE_KEY = 'keenetic_giga_pair_done';

  function log() {
    try {
      console.log.apply(console, ['[Keenetic Giga]'].concat([].slice.call(arguments)));
    } catch (e) {
      /* консоль может быть недоступна */
    }
  }

  // ── UTF-8 ──────────────────────────────────────────────────
  // Пароль может быть не латиницей, а хеши считаются по байтам.
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        if (lo >= 0xdc00 && lo <= 0xdfff) {
          c = ((c - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
          i++;
        }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function toHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
    return hex;
  }

  // ── MD5 ────────────────────────────────────────────────────
  function md5(str) {
    var bytes = utf8Bytes(str);

    // Дополнение: 0x80, нули, затем длина в битах младшим байтом вперёд.
    var msg = bytes.slice();
    var bitLen = bytes.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    // Длина может превысить 2^32 — старшие биты кладём отдельно.
    msg.push(bitLen & 0xff, (bitLen >>> 8) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 24) & 0xff, 0, 0, 0, 0);

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

    // K[i] = floor(2^32 * abs(sin(i+1)))
    var K = new Array(64);
    for (var i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) >>> 0;

    var S = [7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
             5,9,14,20, 5,9,14,20, 5,9,14,20, 5,9,14,20,
             4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
             6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21];

    function rotl(x, c) { return ((x << c) | (x >>> (32 - c))) >>> 0; }

    for (var off = 0; off < msg.length; off += 64) {
      var M = new Array(16);
      for (var j = 0; j < 16; j++) {
        M[j] = (msg[off + j * 4]) | (msg[off + j * 4 + 1] << 8) |
               (msg[off + j * 4 + 2] << 16) | (msg[off + j * 4 + 3] << 24);
      }

      var A = a0, B = b0, C = c0, D = d0;

      for (var k = 0; k < 64; k++) {
        var F, g;
        if (k < 16) { F = (B & C) | (~B & D); g = k; }
        else if (k < 32) { F = (D & B) | (~D & C); g = (5 * k + 1) % 16; }
        else if (k < 48) { F = B ^ C ^ D; g = (3 * k + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * k) % 16; }

        F = (F + A + K[k] + M[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + rotl(F, S[k])) >>> 0;
      }

      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }

    var out = [];
    [a0, b0, c0, d0].forEach(function (w) {
      out.push(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff, (w >>> 24) & 0xff);
    });
    return toHex(out);
  }

  // ── SHA-256 ────────────────────────────────────────────────
  function sha256(str) {
    var bytes = utf8Bytes(str);

    var msg = bytes.slice();
    var bitLen = bytes.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    // Длина в битах, старшим байтом вперёд. Старшие 32 бита почти всегда нули.
    var hi = Math.floor(bitLen / 4294967296);
    msg.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
             (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    var K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];

    function rotr(x, c) { return ((x >>> c) | (x << (32 - c))) >>> 0; }

    for (var off = 0; off < msg.length; off += 64) {
      var w = new Array(64);
      for (var i = 0; i < 16; i++) {
        w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) |
                (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
      }
      for (var i2 = 16; i2 < 64; i2++) {
        var s0 = (rotr(w[i2 - 15], 7) ^ rotr(w[i2 - 15], 18) ^ (w[i2 - 15] >>> 3)) >>> 0;
        var s1 = (rotr(w[i2 - 2], 17) ^ rotr(w[i2 - 2], 19) ^ (w[i2 - 2] >>> 10)) >>> 0;
        w[i2] = (w[i2 - 16] + s0 + w[i2 - 7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3],
          e = H[4], f = H[5], g = H[6], h = H[7];

      for (var k = 0; k < 64; k++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var t1 = (h + S1 + ch + K[k] + w[k]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var t2 = (S0 + maj) >>> 0;

        h = g; g = f; f = e;
        e = (d + t1) >>> 0;
        d = c; c = b; b = a;
        a = (t1 + t2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var out = [];
    H.forEach(function (word) {
      out.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
    });
    return toHex(out);
  }

  // ── Вход на роутер ─────────────────────────────────────────
  // Шаг 1: запрос за параметрами. Роутер отвечает 401 и заголовками X-NDM-*.
  // Ответ читаем даже при ошибке: 401 — это и есть нормальный ход событий.
  function probeAuth(base) {
    return fetch(base + 'auth', { credentials: 'include', cache: 'no-store' }).then(
      function (res) {
        var realm = res.headers.get('X-NDM-Realm') || '';
        var challenge = res.headers.get('X-NDM-Challenge') || '';

        if (!challenge) {
          // Прошивки могут отдавать параметры только в WWW-Authenticate.
          var www = res.headers.get('WWW-Authenticate') || '';
          var m1 = /challenge="([^"]+)"/i.exec(www);
          var m2 = /realm="([^"]+)"/i.exec(www);
          if (m1) challenge = m1[1];
          if (!realm && m2) realm = m2[1];
        }
        return { realm: realm, challenge: challenge };
      },
      function (err) {
        log('не удалось получить параметры авторизации:', err && err.message);
        return null;
      }
    );
  }

  function login(base, user, password) {
    return probeAuth(base).then(function (ch) {
      if (!ch) return false;
      if (!ch.challenge) {
        log('роутер не сообщил параметры авторизации');
        return false;
      }

      var answer = sha256(ch.challenge + md5(user + ':' + ch.realm + ':' + password));
      log('отправляем ответ');

      return fetch(base + 'auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: user, password: answer }),
      }).then(
        function (res) {
          if (res.ok) {
            log('вход выполнен');
            return true;
          }
          log('роутер отклонил вход, статус', res.status);
          return false;
        },
        function (err) {
          log('ошибка входа:', err && err.message);
          return false;
        }
      );
    });
  }

  function apply(payload) {
    if (!payload || !payload.login) return;

    try {
      if (sessionStorage.getItem(DONE_KEY) === '1') return;
    } catch (e) {
      /* приватный режим — просто продолжаем */
    }

    // Адрес берём у самого окна, а не из сообщения. Этот скрипт выполняется
    // внутри страницы роутера — значит, она уже открыта по рабочему адресу,
    // и её собственный источник и есть то, куда надо войти.
    var base = location.origin + '/';

    login(base, payload.login, payload.password || '').then(function (ok) {
      if (!ok) return; // не вышло — молчим, пользователь войдёт вручную
      try {
        sessionStorage.setItem(DONE_KEY, '1');
      } catch (e) {
        /* не критично */
      }
      location.reload();
    });
  }

  // ── Приём данных от страницы связки ────────────────────────
  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || typeof data !== 'object' || data.type !== MSG_TYPE) return;

    if (ALLOWED_ORIGINS.length && ALLOWED_ORIGINS.indexOf(event.origin) === -1) {
      log('сообщение от недоверенного источника отклонено:', event.origin);
      return;
    }

    log('получены данные для входа');
    apply(data);
  });

  log('готов к приёму данных');
})();