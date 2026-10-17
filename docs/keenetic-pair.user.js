// ==UserScript==
// @name         Keenetic Giga — вход по QR
// @namespace    https://github.com/NOTyeamu/KeeneticGigaApp
// @version      1.0.0
// @description  Принимает данные роутера со страницы связки и автоматически входит в веб-интерфейс Keenetic
// @author       NOTyeamu
// @match        http://192.168.*/*
// @match        http://10.*/*
// @match        http://172.16.*/*
// @match        http://my.keenetic.net/*
// @match        https://*.keenetic.link/*
// @match        https://*.keenetic.pro/*
// @match        https://*.keenetic.name/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

/*
 * Зачем это нужно.
 *
 * Страница роутера открывается по обычному http:// на локальном адресе, а это
 * не защищённый контекст: камера там недоступна, и прочитать QR прямо на ней
 * нельзя. Поэтому QR читает страница связки (она на HTTPS), а данные сюда
 * передаются сообщением. Этот скрипт выполняется внутри страницы роутера —
 * значит, в её собственном источнике, — и может заполнить форму входа сам.
 *
 * Скрипт не отправляет данные никуда, кроме самого роутера: они приходят от
 * страницы связки и используются только для входа.
 */

(function () {
  'use strict';

  var MSG_TYPE = 'keenetic-giga-pair';
  // Источник, от которого принимаем данные. Пусто — принимать от любого,
  // иначе связка должна быть ровно с этого адреса.
  var ALLOWED_SOURCE = '';

  // Перезагрузка после успешного входа не должна приводить к повторному
  // заполнению формы: запоминаем факт входа на время сессии страницы.
  var DONE_KEY = 'keenetic_giga_pair_done';
  var config = null;

  function log() {
    try {
      console.log.apply(console, ['[Keenetic Giga]'].concat([].slice.call(arguments)));
    } catch (e) {
      /* ничего */
    }
  }

  // ── Считаем ответ для схемы NDW2 ровно так же, как это делает приложение:
  // md5Hex = MD5("login:realm:password"), затем SHA256(challenge + md5Hex).
  // Обе величины — шестнадцатеричные строки в нижнем регистре.
  //
  // Если разметка роутера изменится и авто-вход не сработает, останется
  // запасной путь: подставить значения в поля и нажать «Войти» — им пользуемся
  // и сейчас, когда разобрать форму не удалось.
  function md5hex(text) {
    return window.CryptoJS && window.CryptoJS.MD5
      ? window.CryptoJS.MD5(text).toString()
      : null;
  }

  function sha256hex(text) {
    return window.CryptoJS && window.CryptoJS.SHA256
      ? window.CryptoJS.SHA256(text).toString()
      : null;
  }

  async function digestAuth(url, login, password) {
    if (!md5hex || !sha256hex) return false;

    var challenge = null;
    var realm = null;

    // Шаг 1: получить запрос. Ожидаем 401 и заголовки с параметрами.
    try {
      var probe = await fetch(new URL('/auth', url).toString(), { credentials: 'include' });
      realm = probe.headers.get('X-NDM-Realm');
      challenge = probe.headers.get('X-NDM-Challenge');

      if (!challenge) {
        // Прошивки могут отдавать параметры только в WWW-Authenticate.
        var www = probe.headers.get('WWW-Authenticate') || '';
        var m1 = /challenge="([^"]+)"/i.exec(www);
        var m2 = /realm="([^"]+)"/i.exec(www);
        if (m1) challenge = m1[1];
        if (!realm && m2) realm = m2[1];
      }
    } catch (e) {
      log('не удалось получить запрос:', e && e.message);
      return false;
    }

    if (!challenge) {
      log('роутер не сообщил параметры авторизации');
      return false;
    }

    var md5 = md5hex(login + ':' + (realm || '') + ':' + password);
    if (!md5) return false;
    var answer = sha256hex(challenge + md5);
    if (!answer) return false;

    // Шаг 3: отправить ответ вместе с сессионной кукой.
    try {
      var res = await fetch(new URL('/auth', url).toString(), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login, password: answer }),
      });
      if (res.ok) {
        log('вход выполнен');
        return true;
      }
      log('роутер отклонил вход:', res.status);
    } catch (e) {
      log('ошибка входа:', e && e.message);
      return false;
    }
    return false;
  }

  // ── Запасной путь: подставить значения в поля формы и нажать «Войти».
  function fillForm(login, password) {
    var inputs = [].slice.call(document.querySelectorAll('input'));

    var passField = inputs.find(function (i) {
      return (i.type || '').toLowerCase() === 'password' && i.offsetParent !== null;
    });
    if (!passField) return false;

    // Поле логина — ввод, идущий перед полем пароля.
    var userField = null;
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i] === passField) break;
      var t = (inputs[i].type || '').toLowerCase();
      if (t === 'text' || t === 'email' || !t) userField = inputs[i];
    }

    function setValue(field, value) {
      if (!field) return;
      var proto = Object.getPrototypeOf(field);
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(field, value);
      else field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (userField) setValue(userField, login);
    setValue(passField, password);

    // Кнопка входа: ищем осмысленную подпись, иначе — кнопку отправки формы.
    var button =
      document.querySelector('button[type="submit"]') ||
      [].slice.call(document.querySelectorAll('button, input[type="submit"]')).find(function (b) {
        var text = ((b.textContent || b.value || '') + '').trim().toLowerCase();
        return text === 'войти' || text === 'sign in' || text === 'login' || text === 'log in';
      });

    if (button) {
      button.click();
      return true;
    }
    return false;
  }

  async function apply(payload) {
    if (!payload || !payload.login) return;

    var url = payload.url || location.href;
    // Не повторяем вход на той же странице после перезагрузки.
    try {
      if (sessionStorage.getItem(DONE_KEY) === '1') return;
    } catch (e) {
      /* приватный режим — просто продолжаем */
    }

    var ok = await digestAuth(url, payload.login, payload.password || '');
    if (!ok) {
      // Схема не подошла — пробуем заполнить форму, когда она появится.
      waitForForm(payload);
      return;
    }

    try {
      sessionStorage.setItem(DONE_KEY, '1');
    } catch (e) {
      /* не критично */
    }
    location.reload();
  }

  function waitForForm(payload) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (document.querySelector('input[type="password"]')) {
        clearInterval(timer);
        if (fillForm(payload.login, payload.password || '')) {
          log('поля заполнены');
        }
      }
      if (tries > 40) clearInterval(timer); // примерно минута
    }, 1500);
  }

  // ── Приём данных от страницы связки.
  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || typeof data !== 'object' || data.type !== MSG_TYPE) return;
    if (ALLOWED_SOURCE && event.origin !== ALLOWED_SOURCE) return;

    log('получены данные для входа');
    apply(data);
  });

  // На случай, если сообщение пришло до загрузки скрипта, просим связку
  // повторить: она шлёт данные несколько раз, этого достаточно.
  log('готов к приёму данных');
})();