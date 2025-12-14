(function () {
  'use strict';

  function apiBase() {
    return (window.STRATDOTS_API_BASE || '').replace(/\/$/, '');
  }

  function getToken() {
    try { return localStorage.getItem('stratdots_token') || ''; } catch (e) { return ''; }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem('stratdots_token', token);
      else localStorage.removeItem('stratdots_token');
    } catch (e) {}
  }

  function $(id) { return document.getElementById(id); }

  function setStatus(text, isError) {
    var el = $('status');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#ff7676' : 'rgba(255,255,255,0.85)';
  }

  async function api(path, options) {
    var base = apiBase();
    if (!base) throw new Error('API base not configured');

    var headers = Object.assign({
      'Content-Type': 'application/json'
    }, (options && options.headers) || {});

    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var res = await fetch(base + path, Object.assign({}, options || {}, { headers: headers }));

    // Handle empty 204
    if (res.status === 204) return { ok: true };

    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function renderProfile(profile) {
    if (!profile) return;
    if ($('profile_username')) $('profile_username').textContent = profile.username || '';
    if ($('profile_xp')) $('profile_xp').textContent = String(profile.xp || 0);
    if ($('profile_level')) $('profile_level').textContent = String(profile.level || 1);
    if ($('profile_coins')) $('profile_coins').textContent = String(profile.coins || 0);

    if ($('profile_box')) $('profile_box').style.display = 'block';
    if ($('login_box')) $('login_box').style.display = 'none';

    // Achievements list (optional)
    if ($('achievements_list')) {
      var a = profile.achievements || {};
      var ids = Object.keys(a).filter(function (k) { return !!a[k]; }).sort();
      $('achievements_list').innerHTML = ids.length
        ? ids.map(function (id) { return '<li>' + escapeHtml(id) + '</li>'; }).join('')
        : '<li style="opacity:0.75">No achievements saved on server yet.</li>';
    }
  }

  function renderLoggedOut() {
    if ($('profile_box')) $('profile_box').style.display = 'none';
    if ($('login_box')) $('login_box').style.display = 'block';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function tokenLogin() {
    var token = getToken();
    if (!token) {
      renderLoggedOut();
      return;
    }
    try {
      var data = await api('/api/profile', { method: 'GET' });
      renderProfile(data.profile);
      setStatus('Logged in.', false);
    } catch (e) {
      setToken('');
      renderLoggedOut();
      setStatus('Session expired. Please login again.', true);
    }
  }

  async function doLogin(kind) {
    var u = ($('username') && $('username').value || '').trim();
    var p = ($('password') && $('password').value || '');
    if (!u || !p) {
      setStatus('Enter username and password.', true);
      return;
    }

    setStatus('Connecting...', false);
    try {
      var data = await api(kind === 'register' ? '/api/register' : '/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p })
      });
      if (data && data.token) setToken(data.token);
      renderProfile(data.profile);
      setStatus('Logged in as ' + (data.profile && data.profile.username ? data.profile.username : u) + '.', false);
    } catch (e) {
      setStatus(e.message || 'Login failed.', true);
    }
  }

  async function doLogout() {
    setStatus('Logging out...', false);
    try {
      await api('/api/logout', { method: 'POST', body: JSON.stringify({ token: getToken() }) });
    } catch (e) {
      // ignore
    }
    setToken('');
    renderLoggedOut();
    setStatus('Logged out.', false);
  }

  async function loadInventory() {
    if (!$('inventory_list')) return;
    setStatus('Loading inventory...', false);
    try {
      var data = await api('/api/inventory', { method: 'GET' });
      if ($('profile_coins')) $('profile_coins').textContent = String(data.coins || 0);
      var inv = data.inventory || {};
      var keys = Object.keys(inv).filter(function (k) { return (inv[k] || 0) > 0; }).sort();
      $('inventory_list').innerHTML = keys.length
        ? keys.map(function (k) { return '<li><strong>' + escapeHtml(k) + '</strong> × ' + escapeHtml(inv[k]) + '</li>'; }).join('')
        : '<li style="opacity:0.75">No cosmetics yet.</li>';
      setStatus('', false);
    } catch (e) {
      setStatus(e.message || 'Failed to load inventory.', true);
    }
  }

  async function loadShop() {
    if (!$('shop_list')) return;
    setStatus('Loading shop...', false);
    try {
      var data = await api('/api/shop/items', { method: 'GET' });
      var items = (data && data.items) || [];
      if (!items.length) {
        $('shop_list').innerHTML = '<li style="opacity:0.75">Shop is empty for now. Cosmetics will be added later.</li>';
        setStatus('', false);
        return;
      }
      $('shop_list').innerHTML = items.map(function (it) {
        var disabled = it.available === false;
        return (
          '<li style="display:flex;justify-content:space-between;gap:12px;align-items:center">' +
            '<span><strong>' + escapeHtml(it.name || it.id) + '</strong><br><span style="opacity:0.75">' + escapeHtml(it.id) + '</span></span>' +
            '<span>' +
              '<span style="margin-right:10px">' + escapeHtml(it.price || 0) + ' coins</span>' +
              '<button class="cta-button" data-buy="' + escapeHtml(it.id) + '" ' + (disabled ? 'disabled' : '') + '>' + (disabled ? 'Soon' : 'Buy') + '</button>' +
            '</span>' +
          '</li>'
        );
      }).join('');

      // Hook buy buttons
      var btns = document.querySelectorAll('[data-buy]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', async function () {
          var itemId = this.getAttribute('data-buy');
          if (!itemId) return;
          setStatus('Buying...', false);
          try {
            await api('/api/shop/buy', { method: 'POST', body: JSON.stringify({ itemId: itemId }) });
            setStatus('Purchased ' + itemId + '.', false);
            await loadInventory();
          } catch (e) {
            setStatus(e.message || 'Purchase failed.', true);
          }
        });
      }

      setStatus('', false);
    } catch (e) {
      setStatus(e.message || 'Failed to load shop.', true);
    }
  }

  function wireButtons() {
    if ($('btn_login')) $('btn_login').addEventListener('click', function () { doLogin('login'); });
    if ($('btn_register')) $('btn_register').addEventListener('click', function () { doLogin('register'); });
    if ($('btn_logout')) $('btn_logout').addEventListener('click', function () { doLogout(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireButtons();
    tokenLogin().then(function () {
      loadInventory();
      loadShop();
    });
  });

})();
