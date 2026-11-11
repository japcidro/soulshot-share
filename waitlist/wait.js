/* soulshot.online — the waitlist page.
 *
 * Three jobs: draw Sol's ring and move it with the voice, play the first
 * minute of a library piece with its words lighting up as they are spoken,
 * and take an email. Everything the page shows as a number comes back from
 * the `waitlist` Edge Function; nothing is invented here.
 */
(function () {
  'use strict'

  var CFG = window.SOULSHOT || {}
  var root = document.documentElement
  var variant = root.dataset.for || 'main'
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:'

  /* The words for this version of the page ------------------------------- */
  if (variant !== 'main') {
    Array.prototype.forEach.call(document.querySelectorAll('[data-' + variant + ']'), function (el) {
      el.textContent = el.getAttribute('data-' + variant)
    })
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-only]'), function (el) {
    if (el.getAttribute('data-only').split(' ').indexOf(variant) < 0) el.hidden = true
  })
  Array.prototype.forEach.call(document.querySelectorAll('[data-appstore]'), function (a) {
    if (CFG.appStore) a.href = CFG.appStore
  })

  /* Where the visitor came from ------------------------------------------ */
  var params = new URLSearchParams(location.search)
  var utm = {}
  ;['source', 'medium', 'campaign', 'content'].forEach(function (k) {
    var v = params.get('utm_' + k)
    if (v) utm[k] = v
  })
  var ref = (params.get('r') || '').toLowerCase()
  if (!/^[a-z0-9]{8}$/.test(ref)) ref = ''
  function sourceLabel() {
    if (utm.source) return utm.source
    if (ref) return 'referral'
    var host = ''
    try { host = new URL(document.referrer).hostname } catch (e) { /* no referrer */ }
    if (!host) return /tiktok|musical_ly|bytedance/i.test(navigator.userAgent) ? 'tiktok' : 'direct'
    if (/tiktok/.test(host)) return 'tiktok'
    if (/instagram/.test(host)) return 'instagram'
    if (/facebook|fb\./.test(host)) return 'facebook'
    if (/youtube|youtu\.be/.test(host)) return 'youtube'
    if (/google\./.test(host)) return 'google'
    if (/soulshot\.online/.test(host)) return 'direct'
    return 'other'
  }
  var source = sourceLabel()

  /* Storage that may not exist (private windows, some in-app browsers) --- */
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch (e) { return null } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) { /* not kept */ } }
  function once(key) {
    try { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1'); return true } catch (e) { return true }
  }

  /* The function behind the list ----------------------------------------- */
  function call(payload) {
    payload.variant = variant
    return fetch(CFG.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data.error && data.error.message) || 'failed')
          err.shown = Boolean(data.error && data.error.message)
          throw err
        }
        return data
      })
    })
  }
  function count(action) { call({ action: action, source: source }).catch(function () { /* a missed count is not the visitor's problem */ }) }
  function track(name) {
    // Fires only once the pixels are installed; until then this is a no-op.
    try { if (window.ttq) window.ttq.track(name) } catch (e) { /* ignore */ }
    try { if (window.fbq) window.fbq('track', name) } catch (e) { /* ignore */ }
  }
  if (!CFG.live && once('soulshot.visit')) count('visit')

  /* Sol's ring ----------------------------------------------------------- */
  // The app's own geometry (src/components/orb/OrbArt.tsx): an outer edge of
  // seven waves with a finer ripple on it, an inner edge of five, and every
  // term a whole multiple of the phase so the loop never jumps.
  var RING = { radius: 0.92, band: 0.26, amplitude: 0.064, lobes: 7, ripple: 11, innerLobes: 5,
    spectral: { radius: 0.885, band: 0.16, amplitude: 0.8, lobes: 5, ripple: 9, innerLobes: 3 }, segments: 96 }
  var ORB = 210, C = 200
  function wavyRing(radius, width, amp, lobes, ripple, innerLobes, phase) {
    var n = RING.segments, d = '', i, t, r
    for (i = 0; i <= n; i++) {
      t = (i / n) * Math.PI * 2
      r = radius + amp * Math.sin(lobes * t + phase) + amp * 0.45 * Math.sin(ripple * t - 2 * phase)
      d += (i ? 'L' : 'M') + (C + r * Math.cos(t)).toFixed(1) + ' ' + (C + r * Math.sin(t)).toFixed(1)
    }
    d += 'Z'
    for (i = n; i >= 0; i--) {
      t = (i / n) * Math.PI * 2
      r = radius - width + amp * 0.7 * Math.sin(innerLobes * t - phase)
      d += (i === n ? 'M' : 'L') + (C + r * Math.cos(t)).toFixed(1) + ' ' + (C + r * Math.sin(t)).toFixed(1)
    }
    return d + 'Z'
  }
  var bandEl = document.getElementById('orb-band')
  var specEl = document.getElementById('orb-spec')
  var specGradient = document.getElementById('g-spec')
  function drawOrb(phase, wave, turn) {
    var R = (ORB / 2) * RING.radius
    bandEl.setAttribute('d', wavyRing(R, R * RING.band, R * RING.amplitude * wave, RING.lobes, RING.ripple, RING.innerLobes, phase))
    var S = RING.spectral, RS = (ORB / 2) * S.radius
    specEl.setAttribute('d', wavyRing(RS, RS * S.band, (ORB / 2) * RING.amplitude * S.amplitude * wave, S.lobes, S.ripple, S.innerLobes, -phase))
    specGradient.setAttribute('gradientTransform', 'rotate(' + turn.toFixed(1) + ' 200 200)')
  }

  var voice = document.getElementById('voice')
  var current = null          // the sample that is loaded
  var words = []              // every word of it, flat: { el, start, end, line }
  var wordAt = -1
  var wave = 1
  var orbVisible = true
  var frame = 0

  /** How far the edges swing right now: at rest 1; more while a word is being said, most on its first beat. */
  function waveTarget() {
    if (!current || voice.paused) return 1
    var t = voice.currentTime, w = words[wordAt]
    if (!w || t > w.end + 0.12) return 1.08
    return 1.25 + 0.55 * Math.exp(-(t - w.start) / 0.16)
  }
  function tick(now) {
    frame = 0
    if (!orbVisible || document.hidden) return
    wave += (waveTarget() - wave) * 0.22
    drawOrb((now / 7000) * Math.PI * 2, wave, (now / 22000) * 360)
    if (current && !voice.paused) follow()
    frame = requestAnimationFrame(tick)
  }
  function wake() { if (!frame && !reduceMotion) frame = requestAnimationFrame(tick) }
  drawOrb(0.6, 1, 0)
  // The words follow the voice whether or not the ring is being drawn (off
  // screen, a background tab, reduced motion); the frame loop only smooths it.
  voice.addEventListener('timeupdate', function () { if (current) follow() })
  if (!reduceMotion) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { orbVisible = entries[0].isIntersecting; wake() }).observe(document.querySelector('.orb-live'))
    }
    document.addEventListener('visibilitychange', wake)
    wake()
  }

  /* A minute, out loud --------------------------------------------------- */
  var SAMPLES = window.SOULSHOT_SAMPLES || {}
  var ask = document.getElementById('ask')
  var lyrics = document.getElementById('lyrics')
  var roll = document.getElementById('lyrics-roll')
  var transport = document.getElementById('transport')
  var toggle = document.getElementById('toggle')
  var progress = document.getElementById('progress')
  var left = document.getElementById('left')
  var piece = document.getElementById('piece')
  var hint = document.getElementById('hint')
  var said = document.getElementById('said')
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'))
  // The prayer goes first on the prayer page and stays off the manifestation
  // page: each lane's visitors hear their own kind first, and never the other's.
  ;(function () {
    var prayerChip = document.querySelector('.chip[data-sample="prayer"]')
    if (!prayerChip) return
    if (variant === 'prayer') prayerChip.parentNode.insertBefore(prayerChip, prayerChip.parentNode.firstChild)
    if (variant === 'manifest') prayerChip.hidden = true
  })()
  var heard = null            // the first sample this visitor played, sent with the sign-up
  var lineEls = []
  var lineAt = -1

  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

  function load(key) {
    var s = SAMPLES[key]
    if (!s) return
    current = key
    words = []; lineEls = []; wordAt = -1; lineAt = -1
    roll.textContent = ''
    roll.style.transform = 'translateY(0)'
    s.lines.forEach(function (line, li) {
      var p = document.createElement('p')
      line.forEach(function (w, wi) {
        var span = document.createElement('span')
        span.textContent = w[0]
        p.appendChild(span)
        if (wi < line.length - 1) p.appendChild(document.createTextNode(' '))
        words.push({ el: span, start: w[1], end: w[2], line: li })
      })
      roll.appendChild(p)
      lineEls.push(p)
    })
    ask.hidden = true; lyrics.hidden = false; transport.hidden = false; piece.hidden = false; hint.hidden = true
    piece.textContent = '“' + s.title + '”, read by ' + s.voice
    said.textContent = s.who + ': “' + s.said + '”'
    said.hidden = false
    left.textContent = fmt(s.end)
    progress.style.width = '0'
    chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.sample === key)) })
    voice.src = s.src
    showLine(0)
  }

  function showLine(i) {
    if (i === lineAt || !lineEls[i]) return
    lineAt = i
    lineEls.forEach(function (p, n) { p.className = n < i ? 'done' : n === i ? 'now' : '' })
    var p = lineEls[i]
    // Keep the line being spoken in the middle of the window.
    var y = p.offsetTop + p.offsetHeight / 2 - lyrics.clientHeight / 2
    roll.style.transform = 'translateY(' + (-Math.max(y, -lyrics.clientHeight / 2 + p.offsetHeight / 2)).toFixed(1) + 'px)'
  }

  /** Bring the words, the bar and the clock up to where the voice is. */
  function follow() {
    var t = voice.currentTime, s = SAMPLES[current]
    var i = wordAt
    if (i >= 0 && words[i] && t < words[i].start) i = -1 // scrubbed back or restarted
    while (i + 1 < words.length && words[i + 1].start <= t + 0.03) i++
    if (i !== wordAt) {
      if (i < wordAt) words.forEach(function (w) { w.el.className = '' })
      for (var n = Math.max(wordAt + 1, 0); n <= i; n++) words[n].el.className = 'said'
      wordAt = i
      if (i >= 0) showLine(words[i].line)
    }
    var total = voice.duration || s.end
    progress.style.width = Math.min(100, (t / total) * 100).toFixed(1) + '%'
    left.textContent = fmt(total - t)
  }

  function play(key) {
    if (key !== current) load(key)
    var p = voice.play()
    if (p && p.catch) p.catch(function () { /* the browser wants another tap; the button is there */ })
    if (!heard) {
      heard = key
      if (!CFG.live) count('play')
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var key = chip.dataset.sample
      if (key === current && !voice.paused) { voice.pause(); return }
      if (key === current && voice.ended) voice.currentTime = 0
      play(key)
    })
  })
  toggle.addEventListener('click', function () {
    if (!current) return
    if (voice.paused) { if (voice.ended) voice.currentTime = 0; play(current) } else voice.pause()
  })
  voice.addEventListener('play', function () { toggle.classList.add('playing'); toggle.setAttribute('aria-label', 'Pause'); wake() })
  voice.addEventListener('pause', function () { toggle.classList.remove('playing'); toggle.setAttribute('aria-label', 'Play') })
  voice.addEventListener('ended', function () {
    progress.style.width = '100%'; left.textContent = '0:00'
    lineEls.forEach(function (p) { p.className = 'done' })
    chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false') })
    hint.hidden = false
    hint.textContent = joined() ? 'Tap another to hear it.' : 'That came from two sentences. Yours would be about your day.'
  })
  voice.addEventListener('error', function () {
    if (!current) return
    hint.hidden = false
    hint.textContent = 'That one would not load. Check your connection and tap it again.'
    current = null
    chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false') })
  })

  /* The list ------------------------------------------------------------- */
  var KEY = 'soulshot.waitlist'
  var state = read(KEY)       // { code, position, lane, price }
  function joined() { return Boolean(state && state.code) }
  var forms = Array.prototype.slice.call(document.querySelectorAll('form[data-join]'))
  var dock = document.getElementById('dock')
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

  // The page's own address, wherever it is served from, with this person's code.
  function shareUrl() { return location.origin + location.pathname.replace(/index\.html$/, '') + '?r=' + state.code }

  /** Swap a form for the after-joining panel; the other forms just say so. */
  function showAfter(form, focus) {
    var panel = document.getElementById('after-template').content.firstElementChild.cloneNode(true)
    var sub = panel.querySelector('[data-after-sub]')
    if (state.already) sub.textContent = 'You were already on it. We’ll email you the day it opens.'
    else if (state.position) sub.textContent = 'You’re number ' + Number(state.position).toLocaleString('en-US') + '. We’ll email you the day it opens.'
    var qLane = panel.querySelector('[data-q="lane"]')
    var qPrice = panel.querySelector('[data-q="price"]')
    var qShare = panel.querySelector('[data-q="share"]')

    function step() {
      // The prayer and manifest pages already know the kind; they go straight to the price.
      var needLane = variant === 'main' && !state.lane
      qLane.hidden = !needLane
      qPrice.hidden = needLane || Boolean(state.price)
      qShare.hidden = needLane || !state.price
    }
    function answer(patch) {
      Object.keys(patch).forEach(function (k) { state[k === 'price_ok' ? 'price' : k] = patch[k] })
      write(KEY, state)
      patch.action = 'answer'; patch.code = state.code
      call(patch).catch(function () { /* the sign-up itself is safe; an unanswered question is fine */ })
      step()
    }
    if (variant !== 'main' && !state.lane) {
      state.lane = variant === 'prayer' ? 'prayer' : 'manifestation'
      write(KEY, state)
      call({ action: 'answer', code: state.code, lane: state.lane }).catch(function () {})
    }
    Array.prototype.forEach.call(panel.querySelectorAll('[data-lane]'), function (b) {
      b.addEventListener('click', function () { answer({ lane: b.dataset.lane }) })
    })
    Array.prototype.forEach.call(panel.querySelectorAll('[data-price]'), function (b) {
      b.addEventListener('click', function () { answer({ price_ok: b.dataset.price }) })
    })
    var done = panel.querySelector('[data-share-done]')
    panel.querySelector('[data-share]').addEventListener('click', function () {
      var data = { title: 'SoulShot', text: 'A one-minute audio made for you every morning. Opening soon.', url: shareUrl() }
      if (navigator.share) {
        navigator.share(data).catch(function () { /* closed the sheet */ })
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(data.url).then(function () { done.textContent = 'Link copied.' }, function () { done.textContent = data.url })
      } else {
        done.textContent = data.url
      }
    })
    step()

    forms.forEach(function (f) {
      if (f === form) { f.replaceWith(panel) } else {
        var note = document.createElement('p')
        note.className = 'after-sub'
        note.textContent = 'You’re on the list. We’ll email you the day it opens.'
        f.replaceWith(note)
      }
    })
    forms = []
    dock.classList.remove('show')
    document.body.classList.remove('has-dock')
    if (focus) panel.focus({ preventScroll: false })
  }

  function fail(form, message) {
    var err = form.querySelector('.form-error')
    err.textContent = message
    err.hidden = false
  }

  forms.forEach(function (form) {
    var input = form.querySelector('input[type="email"]')
    var button = form.querySelector('button[type="submit"]')
    input.addEventListener('input', function () { form.querySelector('.form-error').hidden = true })
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var email = input.value.trim()
      if (!EMAIL.test(email)) { fail(form, 'That email address doesn’t look right. Check it and try again.'); input.focus(); return }
      button.disabled = true
      var label = button.textContent
      button.textContent = 'Joining…'
      call({ action: 'join', email: email, heard: heard, ref: ref || undefined, utm: Object.assign({ source: source }, utm), website: form.querySelector('[name="website"]').value })
        .catch(function (error) {
          // On a developer's machine there may be no function to answer; let the flow be walked.
          if (isLocal && !error.shown) return { code: 'localtst', position: 1, already: false }
          throw error
        })
        .then(function (data) {
          state = { code: data.code, position: data.position, already: data.already }
          write(KEY, state)
          track('CompleteRegistration')
          showAfter(form, true)
        })
        .catch(function (error) {
          button.disabled = false
          button.textContent = label
          fail(form, error.shown ? error.message : 'That didn’t go through. Check your connection and try again.')
        })
    })
  })

  if (joined() && !CFG.live) showAfter(forms[0], false)

  /* The dock: the button within reach once the first form is off screen -- */
  var firstForm = forms[0]
  if (firstForm && !CFG.live && 'IntersectionObserver' in window) {
    var lastForm = forms[forms.length - 1]
    var seen = { first: true, last: false }
    var update = function () { if (forms.length) dock.classList.toggle('show', !seen.first && !seen.last) }
    new IntersectionObserver(function (e) { seen.first = e[0].isIntersecting; update() }).observe(firstForm)
    new IntersectionObserver(function (e) { seen.last = e[0].isIntersecting; update() }).observe(lastForm)
    document.getElementById('dock-join').addEventListener('click', function () {
      lastForm.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
      var field = lastForm.querySelector('input[type="email"]')
      setTimeout(function () { field.focus({ preventScroll: true }) }, reduceMotion ? 0 : 450)
    })
  }
})()
