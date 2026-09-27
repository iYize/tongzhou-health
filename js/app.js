/* ============ 同舟健康 · 雏形交互逻辑 ============ */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  const $  = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const circleName = (id) => { const c = DB.circles.find(c => c.id === id); return c ? c.name : id; };
  const condDept = (name) => { const c = DB.circles.find(c => c.name === name); return c ? c.dept : ''; };
  const nowLabel = () => '刚刚';

  function save() { try { localStorage.setItem('tongzhou_state_v1', JSON.stringify(state)); } catch (e) {} }
  function load() {
    try { const raw = localStorage.getItem('tongzhou_state_v1'); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  function toast(msg) {
    const root = $('#toastRoot');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  /* ---------- 状态 ---------- */
  let state = load() || {
    onboarded: false,
    profile: { nick: '', cond: '', stage: '', city: '' },
    liked: [],                 // liked post ids
    myPosts: [],               // user-created posts
    comments: {},              // postId -> [{by, body}]
    connections: [],           // peer ids
    chat: [],                  // {role:'me'|'ai', text}
    reports: [],               // {name, date, note}
    meds: [],                  // med names
    remindersDone: []          // reminder ids
  };

  /* ---------- 弹窗 ---------- */
  function openModal(html) {
    const root = $('#modalRoot');
    root.innerHTML = '<div class="modal-mask"></div><div class="modal">' + html + '</div>';
    root.classList.add('open');
    root.querySelector('.modal-mask').addEventListener('click', closeModal);
    return root.querySelector('.modal');
  }
  function closeModal() { $('#modalRoot').classList.remove('open'); $('#modalRoot').innerHTML = ''; }

  /* ---------- 引导（科室 → 病症 → 阶段） ---------- */
  function renderOnboard() {
    const root = $('#onboardRoot');
    const depts = DB.depts.map(d =>
      '<button class="ob-choice" data-dept="' + esc(d.name) + '"><b>' + esc(d.name) + '</b><small>' + esc(d.desc) + '</small></button>'
    ).join('');
    root.innerHTML =
      '<div class="onboard">' +
        '<div class="ob-step">STEP 1 / 3 · 选择科室</div>' +
        '<h3>你想在哪个科室找同路人？</h3>' +
        '<p class="ob-sub">先选科室，再选具体病症，匹配更精准（之后可在“我的档案”修改）</p>' +
        '<div class="ob-grid" id="obDept">' + depts + '</div>' +
        '<div class="ob-foot"><span class="ob-note">本演示不收集任何真实健康数据，全部保存在你的浏览器本地</span>' +
        '<button class="btn btn-primary" id="obNext" disabled>下一步</button></div>' +
      '</div>';
    root.classList.add('open');
    let dept = '';
    $('#obDept', root).addEventListener('click', (e) => {
      const b = e.target.closest('.ob-choice'); if (!b) return;
      $$('#obDept .ob-choice', root).forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      dept = b.dataset.dept;
      $('#obNext', root).disabled = false;
    });
    $('#obNext', root).addEventListener('click', () => renderOnboardCond(root, dept));
  }

  function renderOnboardCond(root, dept) {
    const list = DB.circles.filter(c => c.dept === dept);
    root.querySelector('.onboard').innerHTML =
      '<div class="ob-step">STEP 2 / 3 · 选择病症 · ' + esc(dept) + '</div>' +
      '<h3>具体是哪种情况？</h3>' +
      '<p class="ob-sub">选择后为你匹配同病症、同阶段的病友与经验</p>' +
      '<div class="ob-grid" id="obCond">' + list.map(c =>
        '<button class="ob-choice" data-cond="' + esc(c.name) + '"><b>' + esc(c.name) + '</b><small>' + esc(c.desc) + '</small></button>').join('') + '</div>' +
      '<div class="ob-foot"><button class="btn" id="obBack">← 重选科室</button>' +
      '<button class="btn btn-primary" id="obNext" disabled>下一步</button></div>';
    let cond = '';
    $('#obCond', root).addEventListener('click', (e) => {
      const b = e.target.closest('.ob-choice'); if (!b) return;
      $$('#obCond .ob-choice', root).forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      cond = b.dataset.cond;
      $('#obNext', root).disabled = false;
    });
    $('#obBack', root).addEventListener('click', () => renderOnboard());
    $('#obNext', root).addEventListener('click', () => renderOnboardFinal(root, dept, cond));
  }

  function renderOnboardFinal(root, dept, cond) {
    root.querySelector('.onboard').innerHTML =
      '<div class="ob-step">STEP 3 / 3 · 所处阶段 · ' + esc(dept) + ' · ' + esc(cond) + '</div>' +
      '<h3>目前在哪个阶段？</h3>' +
      '<p class="ob-sub">用于匹配同阶段病友，经验与提醒也会按阶段调整</p>' +
      '<div class="ob-grid" id="obStage">' +
        DB.stages.map((st, i) =>
          '<button class="ob-choice" data-stage="' + st + '"><b>' + st + '</b><small>' + ['刚确诊，信息很迷茫', '正在治疗或随访中', '病情稳定逐步恢复'][i] + '</small></button>').join('') +
      '</div>' +
      '<div class="form-row" style="margin-top:16px;"><label>给自己起一个昵称（社区匿名使用）</label>' +
      '<input class="input" id="obNick" maxlength="12" placeholder="如：江畔小满"></div>' +
      '<div class="ob-foot"><button class="btn" id="obBack">← 上一步</button>' +
      '<button class="btn btn-primary" id="obDone" disabled>进入同舟 →</button></div>';
    let stage = '';
    $('#obStage', root).addEventListener('click', (e) => {
      const b = e.target.closest('.ob-choice'); if (!b) return;
      $$('#obStage .ob-choice', root).forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      stage = b.dataset.stage;
      checkReady();
    });
    $('#obNick', root).addEventListener('input', checkReady);
    function checkReady() { $('#obDone', root).disabled = !(stage && $('#obNick', root).value.trim()); }
    $('#obBack', root).addEventListener('click', () => renderOnboardCond(root, dept));
    $('#obDone', root).addEventListener('click', () => {
      state.profile.stage = stage;
      state.profile.nick = $('#obNick', root).value.trim();
      state.profile.cond = cond;
      state.onboarded = true;
      save();
      root.classList.remove('open');
      toast('欢迎加入同舟，' + state.profile.nick + '！');
      renderUser(); renderView('home');
    });
  }

  /* ---------- 路由 ---------- */
  function showView(name) {
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    $('#main').scrollTop = 0;
    renderView(name);
  }
  window.__showView = showView;

  function renderView(name) {
    if (name === 'home') renderHome();
    else if (name === 'circle') renderCircle();
    else if (name === 'match') renderMatch();
    else if (name === 'guide') renderGuide();
    else if (name === 'record') renderRecord();
    else if (name === 'companion') renderChat();
    else if (name === 'guard') renderGuard();
  }

  function renderUser() {
    $('#userNick').textContent = state.profile.nick || '未登录';
    $('#userCond').textContent = state.onboarded
      ? (condDept(state.profile.cond) + ' · ' + state.profile.cond + ' · ' + state.profile.stage) : '完成引导后开启';
    $('#userAvatar').textContent = (state.profile.nick || '舟').charAt(0);
  }

  /* ---------- 首页 ---------- */
  function myCirclePosts() {
    const c = state.profile.cond;
    return allPosts().filter(p => !c || circleName(p.circle) === c);
  }
  function allPosts() { return state.myPosts.concat(DB.posts); }

  function renderHome() {
    const nick = state.profile.nick || '同舟人';
    $('#homeGreeting').textContent = '你好，' + nick;
    $('#homeSub').textContent = state.profile.cond
      ? state.profile.cond + ' · ' + state.profile.stage + ' · 让经验找到人'
      : '让经验找到人，让求医路不再孤单';

    const conns = state.connections.length;
    const circleN = DB.circles.find(c => c.name === state.profile.cond);
    $('#homeStats').innerHTML =
      statCard(myCirclePosts().length, '同圈经验帖') +
      statCard(conns, '已连接病友') +
      statCard(circleN ? formatMembers(circleN.members) : '—', '同圈病友数') +
      statCard(remindPending().length, '待办提醒');

    $('#homeActions').innerHTML = [
      qaBtn('同舟圈 · 看经验', 'circle'),
      qaBtn('病友匹配 · 找同路人', 'match'),
      qaBtn('就医通 · 查医院药品', 'guide'),
      qaBtn('智伴 · 随时提问', 'companion')
    ].join('');

    const rem = remindPending().slice(0, 2);
    $('#homeRemindCount').textContent = remindPending().length + ' 项待办';
    $('#homeReminders').innerHTML = rem.length
      ? rem.map(remindMini).join('')
      : '<div class="empty">当前没有待办提醒</div>';
    bindReminderMini();

    $('#homeFeed').innerHTML = myCirclePosts().slice(0, 3).map(p => postCard(p, true)).join('') ||
      '<div class="empty">本圈还没有内容，去同舟圈逛逛吧</div>';
    bindPostCards($('#homeFeed'));
  }
  function statCard(v, k) { return '<div class="stat-card"><div class="v">' + v + '</div><div class="k">' + k + '</div></div>'; }
  function qaBtn(label, view) { return '<button class="btn" data-goto="' + view + '" style="width:100%;margin-bottom:9px;text-align:left">' + label + '</button>'; }
  function formatMembers(n) { return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万'; }

  /* ---------- 提醒 ---------- */
  function myReminders() {
    const c = state.profile.cond;
    return DB.reminders.filter(r => !c || r.circle === conditionId(c));
  }
  function conditionId(name) { const c = DB.circles.find(c => c.name === name); return c ? c.id : ''; }
  function remindPending() { return myReminders().filter(r => state.remindersDone.indexOf(r.id) < 0); }

  function remindMini(r) {
    const done = state.remindersDone.indexOf(r.id) >= 0;
    return '<div class="remind-item">' +
      '<div class="ri-icon">' + (done ? '✓' : '⏰') + '</div>' +
      '<div class="ri-main"><div class="ri-title" style="' + (done ? 'text-decoration:line-through;opacity:.5' : '') + '">' + esc(r.title) + '</div>' +
      '<div class="ri-sub">' + esc(r.due) + ' · ' + esc(r.detail) + '</div></div>' +
      '<button class="btn btn-sm" data-remind="' + r.id + '">' + (done ? '已办' : '标记完成') + '</button></div>';
  }
  function bindReminderMini() {
    $$('[data-remind]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.remind;
      if (state.remindersDone.indexOf(id) >= 0) {
        state.remindersDone = state.remindersDone.filter(x => x !== id);
      } else {
        state.remindersDone.push(id);
        toast('已完成，真棒！');
      }
      save(); renderView($('.view.active').id.replace('view-', ''));
    }));
  }

  /* ---------- 同舟圈 ---------- */
  let circleFilter = 'all';

  function renderCircle() {
    const tabs = ['<button class="tab ' + (circleFilter === 'all' ? 'active' : '') + '" data-cf="all">全部</button>']
      .concat(DB.circles.map(c =>
        '<button class="tab ' + (circleFilter === c.id ? 'active' : '') + '" data-cf="' + c.id + '">' +
        esc(c.name) + (c.name === state.profile.cond ? ' · 我的圈' : '') + '</button>')).join('');
    $('#circleTabs').innerHTML = tabs;
    $$('#circleTabs .tab').forEach(t => t.addEventListener('click', () => {
      circleFilter = t.dataset.cf; renderCircle();
    }));

    let list = circleFilter === 'all' ? allPosts() : allPosts().filter(p => p.circle === circleFilter);
    if (circleFilter === 'mine') list = allPosts().filter(p => p.mine);
    $('#circleFeed').innerHTML = list.map(p => postCard(p)).join('') || '<div class="empty">这个圈还没有帖子，发布第一条吧</div>';
    bindPostCards($('#circleFeed'));
  }

  function postCard(p, compact) {
    const liked = state.liked.indexOf(p.id) >= 0;
    const comments = (state.comments[p.id] || []);
    const summary = p.aiSummary || null;
    return '<article class="post" data-post="' + p.id + '">' +
      '<div class="post-head">' +
        '<div class="post-avatar">' + esc(p.author.charAt(0)) + '</div>' +
        '<div><div class="post-author">' + esc(p.author) + (p.mine ? ' <span class="chip">我</span>' : '') + '</div>' +
        '<div style="font-size:10.5px;color:var(--faint)">' + esc(circleName(p.circle)) + '</div></div>' +
        '<div class="post-time">' + esc(p.time) + '</div>' +
      '</div>' +
      '<div class="post-title">' + esc(p.title) + '</div>' +
      (function(){ var v = [p.hospital, p.dept, p.doctor].filter(Boolean).join(' · ');
        return v ? '<div class="visit-line">🏥 就诊于：' + esc(v) + '</div>' : ''; })() +
      '<div class="post-body clamped">' + esc(p.body) + '</div>' +
      '<div class="post-foot">' +
        '<button class="post-act likeBtn' + (liked ? ' liked' : '') + '" data-like="' + p.id + '">' +
          '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.6 12 20 12 20z"/></svg>' +
          '<span>' + p.likes + (liked ? ' 已共鸣' : ' 共鸣') + '</span></button>' +
        '<button class="post-act cmtBtn" data-cmt="' + p.id + '"><svg viewBox="0 0 24 24"><path d="M4 6h16v10H9l-5 4z"/></svg>评论 <span>' + comments.length + '</span></button>' +
        '<button class="post-act expandBtn" data-expand="' + p.id + '">展开全文</button>' +
        (summary ? '<button class="post-act" style="color:var(--cyan)" data-ai="' + p.id + '">✦ AI 提炼卡片</button>' : '') +
      '</div>' +
      '<div class="post-tags">' + (p.tags || []).map(t => '<span class="chip">' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="aiSlot" data-aislot="' + p.id + '"></div>' +
      '<div class="comment-slot" data-cmtslot="' + p.id + '"></div>' +
    '</article>';
  }

  function bindPostCards(scope) {
    $$('[data-like]', scope).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.like;
      const p = allPosts().find(x => x.id === id);
      const i = state.liked.indexOf(id);
      if (i >= 0) { state.liked.splice(i, 1); p.likes--; }
      else { state.liked.push(id); p.likes++; }
      save();
      const span = b.querySelector('span');
      b.classList.toggle('liked', i < 0);
      span.textContent = p.likes + (i < 0 ? ' 已共鸣' : ' 共鸣');
    }));

    $$('[data-expand]', scope).forEach(b => b.addEventListener('click', () => {
      const post = b.closest('.post');
      const body = post.querySelector('.post-body');
      const clamped = body.classList.toggle('clamped');
      b.textContent = clamped ? '展开全文' : '收起';
    }));

    $$('[data-cmt]', scope).forEach(b => b.addEventListener('click', () => {
      const slot = $('[data-cmtslot="' + b.dataset.cmt + '"]', scope);
      if (slot.style.display === 'block') { slot.style.display = 'none'; return; }
      renderComments(slot, b.dataset.cmt);
      slot.style.display = 'block';
    }));

    $$('[data-ai]', scope).forEach(b => b.addEventListener('click', () => {
      const slot = $('[data-aislot="' + b.dataset.ai + '"]', scope);
      if (slot.style.display === 'block') { slot.style.display = 'none'; return; }
      const p = allPosts().find(x => x.id === b.dataset.ai);
      const s = p.aiSummary || naiveSummary(p);
      const rows = Object.keys(s).map(k =>
        '<dt>' + esc(k) + '</dt><dd>' + esc(s[k]) + '</dd>').join('');
      slot.innerHTML = '<div class="ai-card"><div class="ai-head"><span class="dot"></span>AI 经验卡片 · 一分钟读懂</div><dl>' + rows + '</dl></div>';
      slot.style.display = 'block';
    }));
  }

  function renderComments(slot, postId) {
    const list = state.comments[postId] || [];
    slot.innerHTML = '<div class="comment-box">' +
      list.map(c => '<div class="comment"><b>' + esc(c.by) + '：</b>' + esc(c.body) + '</div>').join('') +
      '<div class="comment-input"><input class="input" placeholder="友善地补充一句…"><button class="btn btn-sm">发送</button></div></div>';
    const input = slot.querySelector('input');
    slot.querySelector('button').addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) return;
      (state.comments[postId] = state.comments[postId] || []).push({ by: state.profile.nick || '我', body: v });
      save();
      renderComments(slot, postId);
      toast('评论已发布');
    });
  }

  function naiveSummary(p) {
    const pick = (kw) => (p.body.split('\n').find(l => l.indexOf(kw) >= 0) || '').replace(/^\d+[①-⑩\.、\s]*/, '');
    return {
      '治疗方案': pick('方案') || pick('治疗') || '见原文',
      '费用参考': pick('费用') || pick('元') || '见原文',
      '关键提醒': pick('提醒') || pick('注意') || pick('建议') || '详见原文交流',
      '信息来源': p.mine ? '我的分享 · 本地保存' : '病友分享 · 演示数据'
    };
  }

  /* 发布 */
  function openNewPost() {
    const options = DB.circles.map(c => '<option value="' + c.id + '"' + (c.name === state.profile.cond ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    const m = openModal(
      '<h3>发布经验分享</h3><div class="modal-sub">发到同舟圈，AI 会自动帮你提炼经验卡片</div>' +
      '<div class="modal-body">' +
        '<div class="form-row"><label>选择圈子</label><select class="select" id="npCircle">' + options + '</select></div>' +
        '<div class="form-row"><label>标题</label><input class="input" id="npTitle" maxlength="40" placeholder="一句话说清这篇经验的主题"></div>' +
        '<div class="form-row"><label>正文（写清方案/费用/建议，能帮到更多人）</label><textarea id="npBody" placeholder="如：我做了什么治疗、花了多少、有什么建议…&#10;请勿发布广告、募捐与夸大宣传内容"></textarea></div>' +
        '<div class="form-row"><label>就诊信息（选填，病友最关心）：医院 / 科室 / 医生</label>' +
          '<div class="visit-inputs">' +
            '<input class="input" id="npHospital" maxlength="30" placeholder="医院，如：中国医学科学院皮肤病医院">' +
            '<input class="input" id="npDept" maxlength="20" placeholder="科室，如：皮肤科">' +
            '<input class="input" id="npDoctor" maxlength="20" placeholder="医生（虚构演示可用昵称）">' +
          '</div></div>' +
        '<div class="form-row"><label>标签（选填）</label>' +
          '<div class="choice-grid" id="npTags">' +
            ['治疗经历', '费用清单', '就医攻略', '用药交流'].map(t => '<button class="choice" data-tag="' + t + '">' + t + '</button>').join('') +
          '</div></div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" id="npCancel">取消</button><button class="btn btn-primary" id="npSubmit">发布</button></div>');
    const tags = new Set();
    $('#npTags', m).addEventListener('click', (e) => {
      const b = e.target.closest('.choice'); if (!b) return;
      b.classList.toggle('sel');
      if (tags.has(b.dataset.tag)) tags.delete(b.dataset.tag); else tags.add(b.dataset.tag);
    });
    $('#npCancel', m).addEventListener('click', closeModal);
    $('#npSubmit', m).addEventListener('click', () => {
      const title = $('#npTitle', m).value.trim();
      const body = $('#npBody', m).value.trim();
      if (!title || !body) { toast('标题和正文都要填写哦'); return; }
      state.myPosts.unshift({
        id: 'mine_' + Date.now(), circle: $('#npCircle', m).value,
        author: state.profile.nick || '我', time: nowLabel(),
        likes: 0, tags: Array.from(tags), title: title, body: body, mine: true,
        hospital: $('#npHospital', m).value.trim(),
        dept: $('#npDept', m).value.trim(),
        doctor: $('#npDoctor', m).value.trim()
      });
      circleFilter = $('#npCircle', m).value;
      save(); closeModal(); renderCircle();
      toast('已发布到我的分享，AI 卡片可随时一键提炼');
    });
  }

  /* ---------- 病友匹配 ---------- */
  function matchScore(p) {
    if (p.cond !== state.profile.cond) return 0;
    let s = 78;
    if (p.stage === state.profile.stage) s += 12;
    if (p.city === state.profile.city) s += 5;
    if (p.tags.indexOf('同方案') >= 0) s += 2;
    return Math.min(s, 98);
  }

  function renderMatch() {
    const c = DB.circles.find(c => c.name === state.profile.cond);
    $('#myConditionBar').innerHTML =
      '<div class="my-cond-bar"><span style="font-size:18px">🤝</span>' +
      '<div style="flex:1"><b>我的病症圈：' + esc(state.profile.cond || '未设置') + ' · ' + esc(state.profile.stage || '') + '</b>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + (c ? esc(c.dept + ' · ') + esc(c.desc) + ' · 同圈 ' + formatMembers(c.members) + ' 人' : '先在引导中选择病症') + '</div></div>' +
      '<span class="chip chip-cyan">AI 语义匹配 · 演示</span></div>';

    const stage = $('#matchStageFilter').value;
    let peers = DB.peers
      .filter(p => p.cond === state.profile.cond)
      .map(p => ({ p: p, s: matchScore(p) }));
    if (!peers.length) {
      peers = DB.peers.slice(0, 6).map(p => ({ p: p, s: matchScore(p) || 0 }));
    }
    if (stage) peers = peers.filter(x => x.p.stage === stage);
    peers.sort((a, b) => b.s - a.s);

    $('#matchGrid').innerHTML = peers.map(({ p, s }) =>
      '<div class="peer">' +
        '<div class="peer-avatar">' + esc(p.nick.charAt(0)) + '<div class="match-score">' + (s || '跨圈') + '</div></div>' +
        '<div class="peer-info">' +
          '<div class="peer-name">' + esc(p.nick) + '<span class="chip">' + esc(p.cond) + '</span><span class="chip chip-dim">' + esc(p.stage) + '</span></div>' +
          '<div class="peer-bio">' + esc(p.bio) + '</div>' +
          '<div class="visit-line">🏥 ' + ([p.hospital, p.dept, p.doctor].filter(Boolean).join(' · ') || '就诊信息待补充') + '</div>' +
          '<div class="peer-tags">' +
            '<span class="chip chip-dim">' + esc(p.city) + ' · ' + esc(p.age) + '</span>' +
            p.tags.map(t => '<span class="chip">' + esc(t) + '</span>').join('') +
            '<span class="chip chip-green">帮到 ' + p.helpful + ' 人</span>' +
          '</div>' +
          '<div class="peer-foot">' +
            '<button class="btn btn-sm btn-primary" data-connect="' + p.id + '">' +
              (state.connections.indexOf(p.id) >= 0 ? '已连接 · 发消息' : '打个招呼') + '</button>' +
            '<span class="chip chip-dim">' + (s >= 90 ? '高相似度' : s ? '同圈' : '其他圈子') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>').join('') || '<div class="empty">该阶段暂无病友，换个筛选条件试试</div>';

    $$('[data-connect]').forEach(b => b.addEventListener('click', () => openConnect(b.dataset.connect)));
  }

  function openConnect(peerId) {
    const p = DB.peers.find(x => x.id === peerId);
    const connected = state.connections.indexOf(peerId) >= 0;
    const presets = ['你好，看到你也关注' + p.cond + '，想和你交流一下', '想请教你的治疗经验，方便聊聊吗？', '我情况和您很像，希望互相鼓励'];
    const m = openModal(
      '<h3>向 ' + esc(p.nick) + ' 打个招呼</h3>' +
      '<div class="modal-sub">' + esc(p.cond) + ' · ' + esc(p.stage) + ' · ' + esc(p.city) + ' · 帮到 ' + p.helpful + ' 人</div>' +
      '<div class="modal-sub" style="color:var(--acc-soft)">🏥 就诊于：' + esc([p.hospital, p.dept, p.doctor].filter(Boolean).join(' · ') || '未填写') + '</div>' +
      '<div class="modal-body">' +
        '<div class="form-row"><label>选择问候语（可修改）</label>' +
        '<div class="choice-grid" id="ctPresets">' + presets.map(t => '<button class="choice' + (t === presets[0] ? ' sel' : '') + '">' + esc(t) + '</button>').join('') + '</div></div>' +
        '<div class="form-row"><textarea id="ctMsg" style="min-height:80px">' + esc(presets[0]) + '</textarea></div>' +
        '<p class="muted-note">真实产品中，首次连接将双方匿名展示病症与阶段，交流内容经隐私脱敏。</p>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" id="ctCancel">取消</button><button class="btn btn-primary" id="ctSend">' + (connected ? '发送消息' : '发送并连接') + '</button></div>');
    $('#ctPresets', m).addEventListener('click', (e) => {
      const b = e.target.closest('.choice'); if (!b) return;
      $$('#ctPresets .choice', m).forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      $('#ctMsg', m).value = b.textContent;
    });
    $('#ctCancel', m).addEventListener('click', closeModal);
    $('#ctSend', m).addEventListener('click', () => {
      if (state.connections.indexOf(peerId) < 0) {
        state.connections.push(peerId);
        save();
        toast('已连接 ' + p.nick + '，TA 被加入你的病友列表');
      } else {
        toast('消息已发送给 ' + p.nick + '（演示环境为模拟发送）');
      }
      closeModal(); renderMatch();
    });
  }

  /* ---------- 就医通 ---------- */
  let guideTab = 'hospital';

  function renderGuide() {
    $$('#view-guide [data-gtab]').forEach(t => {
      t.classList.toggle('active', t.dataset.gtab === guideTab);
    });
    const q = ($('#guideSearch').value || '').trim().toLowerCase();
    const sort = $('#guideSort').value;

    if (guideTab === 'hospital') {
      let list = DB.hospitals.filter(h =>
        !q || h.name.toLowerCase().indexOf(q) >= 0 || h.city.toLowerCase().indexOf(q) >= 0 ||
        h.depts.join('').toLowerCase().indexOf(q) >= 0);
      list = list.slice().sort((a, b) => sort === 'cost'
        ? minCost(a) - minCost(b)
        : b.rating - a.rating);
      $('#guideGrid').innerHTML = list.map(hospitalCard).join('') ||
        '<div class="empty">没有匹配的医院，换个关键词试试</div>';
      $$('#guideGrid .hospital').forEach(el =>
        el.addEventListener('click', () => openHospital(el.dataset.h)));
    } else {
      let list = DB.meds.filter(m =>
        !q || m.name.toLowerCase().indexOf(q) >= 0 || m.cat.toLowerCase().indexOf(q) >= 0);
      $('#guideGrid').innerHTML = list.map(medCard).join('') ||
        '<div class="empty">没有匹配的药品</div>';
      $$('#guideGrid .med-card').forEach(el =>
        el.addEventListener('click', () => openMed(el.dataset.m)));
    }
  }
  function minCost(h) {
    const n = (h.costs[0] || ['0-0'])[1].match(/[\d.]+/);
    return n ? parseFloat(n[0]) : 0;
  }

  function verifiedBadge(h) {
    return h.verified
      ? '<span class="verified" title="AI 对评价来源、费用区间进行多来源交叉比对后标注"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5.2c0 4.8-3.3 7.9-7 9-3.7-1.1-7-4.2-7-9V6z"/><path d="M9.2 11.6l2 2 3.6-3.8"/></svg>AI 核验</span>'
      : '';
  }

  function hospitalCard(h) {
    return '<div class="hospital" data-h="' + h.id + '">' +
      '<div class="hp-top"><div><div class="hp-name">' + esc(h.name) + '</div>' +
      '<div class="hp-meta">' + esc(h.city) + ' · ' + esc(h.level) + ' · ' + h.reviewsN + ' 位病友评价</div></div>' +
      '<div class="hp-rating"><div class="num">' + h.rating.toFixed(1) + '</div><div class="lab">病友口碑</div></div></div>' +
      '<div class="hp-stats">' +
        '<div class="hp-stat"><div class="s-v">' + esc(h.costs[0][1]) + '</div><div class="s-k">' + esc(h.costs[0][0]) + '</div></div>' +
        '<div class="hp-stat"><div class="s-v">' + esc(h.insurance) + '</div><div class="s-k">医保</div></div>' +
      '</div>' +
      '<div class="hp-depts">' + h.depts.map(d => '<span class="chip">' + esc(d) + '</span>').join('') + verifiedBadge(h) + '</div>' +
    '</div>';
  }

  function medCard(m) {
    return '<div class="med-card" data-m="' + m.id + '">' +
      '<div class="med-top"><div><div class="med-name">' + esc(m.name) + '</div>' +
      '<div class="med-cat">' + esc(m.cat) + ' · ' + esc(m.insurance) + '</div></div>' +
      '<div class="med-price">' + esc(m.price) + '</div></div>' +
      '<div class="med-desc">' + esc(m.desc) + '</div>' +
      '<div style="margin-top:9px">' + verifiedBadge({ verified: true }) + ' <span class="chip chip-dim">' + m.reviews.length + ' 条病友用药反馈</span></div>' +
    '</div>';
  }

  function openHospital(id) {
    const h = DB.hospitals.find(x => x.id === id);
    openModal(
      '<h3>' + esc(h.name) + '</h3>' +
      '<div class="modal-sub">' + esc(h.city) + ' · ' + esc(h.level) + ' · 口碑 ' + h.rating.toFixed(1) + '（' + h.reviewsN + ' 位病友）' + '</div>' +
      '<div class="modal-body">' +
        '<div class="hp-depts" style="margin-bottom:6px">' + h.depts.map(d => '<span class="chip">' + esc(d) + '</span>').join('') + verifiedBadge(h) + '</div>' +
        '<p style="font-size:12px;color:var(--muted)">' + esc(h.note) + '</p>' +
        '<table class="cost-table">' +
          '<tr><td style="border-top:0;color:var(--faint)">费用项目（病友分享区间）</td><td style="border-top:0;color:var(--faint)">区间</td></tr>' +
          h.costs.map(c => '<tr><td>' + esc(c[0]) + '</td><td>' + esc(c[1]) + '</td></tr>').join('') +
        '</table>' +
        '<div class="chip chip-cyan" style="margin-top:10px">' + esc(h.insurance) + '</div>' +
        '<div style="margin-top:14px;font-size:12px;font-weight:700;color:var(--acc-soft)">病友评价</div>' +
        h.reviews.map(r =>
          '<div class="review"><div class="review-head"><b>' + esc(r.by) + '</b><span class="post-time">' + esc(r.time) + '</span><span class="review-evi">' + esc(r.evi) + '</span></div>' +
          '<div class="review-body">' + esc(r.body) + '</div></div>').join('') +
        '<p class="muted-note">评价与费用为病友分享的演示数据，已按“同舟守护”体系标注证据等级；AI 核验表示多来源交叉比对，不构成推荐。</p>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" id="dClose">关闭</button></div>');
    $('#dClose').addEventListener('click', closeModal);
  }

  function openMed(id) {
    const m = DB.meds.find(x => x.id === id);
    openModal(
      '<h3>' + esc(m.name) + '</h3>' +
      '<div class="modal-sub">' + esc(m.cat) + '</div>' +
      '<div class="modal-body">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">' +
          '<span class="med-price">' + esc(m.price) + '</span>' +
          '<span class="chip chip-cyan">' + esc(m.insurance) + '</span>' + verifiedBadge({ verified: true }) +
        '</div>' +
        '<p style="font-size:12.5px;color:var(--muted);line-height:1.8">' + esc(m.desc) + '</p>' +
        '<div style="margin-top:13px;font-size:12px;font-weight:700;color:var(--acc-soft)">常见替代方案对比</div>' +
        '<table class="cost-table">' +
          m.alt.map(a => '<tr><td>' + esc(a.name) + '<div style="font-size:10px;color:var(--faint)">' + esc(a.note) + '</div></td><td>' + esc(a.price) + '</td></tr>').join('') +
        '</table>' +
        '<div style="margin-top:13px;font-size:12px;font-weight:700;color:var(--acc-soft)">病友用药反馈</div>' +
        m.reviews.map(r =>
          '<div class="review"><div class="review-head"><b>' + esc(r.by) + '</b><span class="review-evi">' + esc(r.evi) + '</span></div>' +
          '<div class="review-body">' + esc(r.body) + '</div></div>').join('') +
        '<div class="disclaimer" style="margin-top:14px">' + esc(m.warn) + ' 本信息为演示数据，仅供健康参考，不构成用药建议。</div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" id="dClose">关闭</button>' +
      '<button class="btn btn-primary" id="dUseMed">加入我的用药清单</button></div>');
    $('#dClose').addEventListener('click', closeModal);
    $('#dUseMed').addEventListener('click', () => {
      if (state.meds.indexOf(m.name) < 0) state.meds.push(m.name);
      save(); closeModal(); renderRecord();
      toast('已加入用药清单，复诊时可一键展示');
    });
  }

  /* ---------- 我的档案 ---------- */
  const sampleReports = [
    { name: '血常规 + 生化全套', note: '白细胞 6.2，血糖偏高的项目已标黄', date: '2 周前' },
    { name: '浅表器官超声', note: '未见明显异常，建议年度随访', date: '1 个月前' },
    { name: 'CT 影像报告', note: '原病灶区域稳定，对比前片无变化', date: '2 个月前' }
  ];

  function renderRecord() {
    const p = state.profile;
    $('#recordProfile').innerHTML =
      '<div class="profile-bar"><div class="avatar">' + esc((p.nick || '舟').charAt(0)) + '</div>' +
      '<div style="flex:1"><div style="font-size:16px;font-weight:900">' + esc(p.nick || '未命名') + '</div>' +
      '<div class="profile-tags">' +
        (p.cond ? '<span class="chip">' + esc(p.cond) + '</span><span class="chip">' + esc(p.stage) + '</span>' : '<span class="chip chip-dim">尚未完成引导</span>') +
        '<span class="chip chip-dim">本地存储 · 隐私分级</span></div>' +
      '<div style="flex:1.2;min-width:0">' +
        '<div style="font-size:10.5px;color:var(--faint);letter-spacing:.1em;margin-bottom:4px">常就诊</div>' +
        '<div class="visit-line" style="margin:0">' + esc([p.hospital, p.dept, p.doctor].filter(Boolean).join(' · ') || '在“编辑资料”中填写') + '</div>' +
      '</div>' +
      '<button class="btn btn-sm" id="editProfile">编辑资料</button></div>';

    $('#editProfile').addEventListener('click', () => {
      const m = openModal(
        '<h3>编辑资料</h3><div class="modal-sub">仅保存在本地浏览器</div>' +
        '<div class="modal-body">' +
          '<div class="form-row"><label>昵称</label><input class="input" id="epNick" value="' + esc(p.nick) + '" maxlength="12"></div>' +
          '<div class="form-row"><label>关注的病症圈（按科室分组）</label><select class="select" id="epCond">' +
            (function(){ const g = {}; DB.circles.forEach(c => (g[c.dept] = g[c.dept] || []).push(c));
              return Object.keys(g).map(d => '<optgroup label="' + esc(d) + '">' +
                g[d].map(c => '<option' + (c.name === p.cond ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</optgroup>').join(''); })() +
            '</select></div>' +
          '<div class="form-row"><label>阶段</label><select class="select" id="epStage">' +
            DB.stages.map(s => '<option' + (s === p.stage ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
          '<div class="form-row"><label>所在城市（用于同城匹配）</label><select class="select" id="epCity">' +
            ['上海', '北京', '广州', '杭州', '南京', '成都', '武汉'].map(c => '<option' + (c === p.city ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
          '<div class="form-row"><label>常就诊的医院</label><input class="input" id="epHospital" value="' + esc(p.hospital || '') + '" maxlength="30" placeholder="如：中国医学科学院皮肤病医院"></div>' +
          '<div class="form-row"><label>科室</label><input class="input" id="epDept" value="' + esc(p.dept || '') + '" maxlength="20" placeholder="如：皮肤科"></div>' +
          '<div class="form-row"><label>常就诊的医生（选填）</label><input class="input" id="epDoctor" value="' + esc(p.doctor || '') + '" maxlength="20" placeholder="如：宋知夏 副主任医师"></div>' +
        '</div>' +
        '<div class="modal-foot"><button class="btn" id="epCancel">取消</button><button class="btn btn-primary" id="epSave">保存</button></div>');
      $('#epCancel', m).addEventListener('click', closeModal);
      $('#epSave', m).addEventListener('click', () => {
        p.nick = $('#epNick', m).value.trim() || p.nick;
        p.cond = $('#epCond', m).value;
        p.stage = $('#epStage', m).value;
        p.city = $('#epCity', m).value;
        p.hospital = $('#epHospital', m).value.trim();
        p.dept = $('#epDept', m).value.trim();
        p.doctor = $('#epDoctor', m).value.trim();
        state.onboarded = true;
        save(); closeModal(); renderUser(); renderRecord();
        toast('资料已更新，匹配结果将随之变化');
      });
    });

    const reports = state.reports.length ? state.reports : sampleReports;
    $('#reportList').innerHTML = reports.map(r =>
      '<div class="report-item"><div class="ri-icon">📋</div>' +
      '<div class="ri-main"><div class="ri-title">' + esc(r.name) + '</div><div class="ri-sub">' + esc(r.date) + ' · ' + esc(r.note) + '</div></div>' +
      '<span class="chip chip-cyan">AI 可解读</span></div>').join('') ||
      '<div class="empty">还没有报告，点击右上角添加示例</div>';

    $('#medList').innerHTML = (state.meds.length ? state.meds : []).map(n =>
      '<div class="med-item"><div class="ri-icon">💊</div>' +
      '<div class="ri-main"><div class="ri-title">' + esc(n) + '</div><div class="ri-sub">点击“就医通-药品”查看用法与替代方案</div></div>' +
      '<button class="btn btn-sm" data-delmed="' + esc(n) + '">移除</button></div>').join('') ||
      '<div class="empty">用药清单为空，可从就医通添加</div>';
    $$('[data-delmed]').forEach(b => b.addEventListener('click', () => {
      state.meds = state.meds.filter(x => x !== b.dataset.delmed);
      save(); renderRecord(); toast('已移除');
    }));

    $('#remindList').innerHTML = myReminders().map(remindMini).join('') || '<div class="empty">暂无提醒</div>';
    bindReminderMini();

    $('#aiSummaryBox').innerHTML = '';
  }

  function addSampleReport() {
    const pool = [
      { name: '糖化血红蛋白（HbA1c）', note: '6.8%，较上次下降 0.4', date: '刚刚' },
      { name: '肿瘤标志物五项', note: '均在参考范围内', date: '刚刚' },
      { name: '血脂四项', note: '低密度脂蛋白偏高，建议饮食调整后复查', date: '刚刚' }
    ];
    const r = pool[state.reports.length % pool.length];
    state.reports.unshift(r);
    save(); renderRecord();
    toast('示例报告已录入，AI 解读为演示能力');
  }

  function aiSummary() {
    const p = state.profile;
    const rep = (state.reports.length ? state.reports : sampleReports).slice(0, 2);
    const box = $('#aiSummaryBox');
    box.innerHTML = '<div class="summary-card"><h4><span class="ai-card-dot" style="width:7px;height:7px;border-radius:50%;background:var(--cyan);display:inline-block"></span>AI 病情摘要（用于复诊沟通）</h4>' +
      '<p>患者' + esc(p.nick || '') + '，' + esc(p.cond || '') + esc(p.stage ? ' · ' + p.stage : '') + '。' +
      '最近检查：' + rep.map(r => r.name + '（' + r.note + '）').join('；') + '。' +
      '当前用药：' + (state.meds.length ? state.meds.join('、') : '无记录') + '。' +
      '待办提醒 ' + remindPending().length + ' 项。建议复诊时重点与医生确认：下一步治疗方案与本次检查异常项。' +
      '<span class="mini">由本地规则模拟生成 · 摘要仅供整理参考，具体诊疗以医生判断为准</span></p></div>';
    toast('AI 摘要已生成，可展示给医生快速了解病程');
  }

  /* ---------- 同舟智伴（本地规则模拟 AI） ---------- */
  function renderChat() {
    const w = $('#chatWindow');
    if (!state.chat.length) {
      state.chat.push({ role: 'ai', text: '你好呀，我是同舟智伴 🫧\n我可以帮你：\n· 匹配同病症、同阶段的病友\n· 查医院口碑与费用参考\n· 查药品价格、医保与替代方案\n· 听你聊聊心情，或整理复诊要带的材料\n（演示环境：回复由本地规则生成，不构成诊疗建议）' });
      save();
    }
    w.innerHTML = state.chat.map(m =>
      '<div class="msg ' + (m.role === 'me' ? 'me' : '') + '">' +
      '<div class="msg-avatar">' + (m.role === 'me' ? esc((state.profile.nick || '我').charAt(0)) : '智') + '</div>' +
      '<div class="msg-bubble">' + esc(m.text) + '</div></div>').join('');
    w.scrollTop = w.scrollHeight;

    $('#chatChips').innerHTML = DB.quickChips.map(c => '<span class="chip" data-chip="' + esc(c) + '">' + esc(c) + '</span>').join('');
    $$('[data-chip]').forEach(c => c.addEventListener('click', () => sendChat(c.dataset.chip)));
  }

  function aiReply(text) {
    const t = text.toLowerCase();
    const cond = state.profile.cond || '';
    const stage = state.profile.stage || '';

    if (/病友|同阶段|匹配|同路人|找人/.test(t)) {
      let pool = DB.peers.filter(p => p.cond === cond);
      if (!pool.length) pool = DB.peers;
      const sameStage = pool.filter(p => p.stage === stage);
      const pick = (sameStage.length ? sameStage : pool).slice(0, 2);
      return '为你匹配到 ' + (sameStage.length ? '同病症同阶段' : '相关') + '的病友：\n' +
        pick.map(p => '· ' + p.nick + '（' + p.stage + ' · ' + p.city + '）帮助过 ' + p.helpful + ' 人，TA 说：“' + p.bio.slice(0, 24) + '…”').join('\n') +
        '\n\n可以去「病友匹配」页给 TA 打个招呼。匹配依据：病症一致 + 阶段相同 + 同城加权。';
    }
    if (/医院|哪家|挂号|就诊|科室/.test(t)) {
      const deptMap = { '乳腺癌':'乳腺', '2型糖尿病':'内分泌', '高血压':'高血压', '甲状腺结节':'甲状腺', '腰椎间盘突出':'脊柱', '哮喘':'呼吸', '焦虑抑郁':'精神', '慢性胃炎':'消化', '痤疮':'皮肤', '玫瑰痤疮':'皮肤', '慢性荨麻疹':'皮肤', '特应性皮炎':'皮肤', '强直性脊柱炎':'风湿', '痛风':'风湿', '溃疡性结肠炎':'消化', '子宫内膜异位症':'妇科', '偏头痛':'神经' };
      const key = deptMap[cond] || '消化';
      const hits = DB.hospitals.filter(h => h.depts.join('').indexOf(key) >= 0);
      const list = (hits.length ? hits : DB.hospitals).slice(0, 2);
      return '病友口碑较好的相关医院：\n' +
        list.map(h => '· ' + h.name + '（' + h.city + ' · 口碑 ' + h.rating.toFixed(1) + '）相关项目参考价 ' + h.costs[0][1]).join('\n') +
        '\n\n已通过 AI 核验标注评价来源；费用为区间参考，个体方案不同会有差异。详情见「同舟就医通」。';
    }
    if (/多少钱|费用|价格|贵|医保|花钱/.test(t)) {
      const med = DB.meds.find(m => t.indexOf(m.name.slice(0, 3)) >= 0) ||
        DB.meds.find(m => cond === '2型糖尿病' && m.name.indexOf('二甲双胍') >= 0) ||
        DB.meds[0];
      return '给你查到的费用参考：\n· ' + med.name + '：' + med.price + '（' + med.insurance + '）\n· 常见替代：' + med.alt.map(a => a.name + ' ' + a.price).join(' / ') +
        '\n\n提示：个体方案与地区差异会有浮动，以医院实际收费为准。详细对比见「就医通-药品」。';
    }
    if (/白细胞|化疗|升白|副反应|副作用/.test(t)) {
      return '病友圈里关于化疗后白细胞的高赞经验：\n· 化疗后 4-7 天是白细胞低谷，早晚测体温\n· 体温超 38℃ 不要硬扛，立刻联系主治或急诊\n· 可与医生沟通预防性升白方案\n\n完整帖见「同舟圈」：《化疗期间的白细胞应对》。个体差异大，具体请遵你的主治医生。';
    }
    if (/焦虑|难过|害怕|担心|压力大|emo|失眠/.test(t)) {
      return '辛苦了，愿意说出来已经很勇敢 🫂\n这种不确定感很多同路人都有过——「同舟圈·匿名树洞」里' +
        (cond ? cond + '圈' : '') + '有 1.8 万位病友在互相打气。\n\n如果情绪持续影响睡眠和饮食超过两周，建议挂精神科/心理科看一看，它和感冒一样是可以治的。要不要我帮你看看「慢慢来比较快」写的第一次就诊攻略？';
    }
    if (/复诊|复查|带什么|资料/.test(t)) {
      const rem = remindPending()[0];
      return '复诊准备清单：\n· 检查报告与出院小结（按时间排序）\n· 用药清单与血压/血糖记录\n· 想问医生的问题（提前写下来）\n' +
        (rem ? '\n你最近的一项提醒：「' + rem.title + '」（' + rem.due + '），记得' + rem.detail + '。' : '') +
        '\n\n可以在「我的档案」点“AI 生成病情摘要”，一键整理给医生看的病程小结。';
    }
    if (/报告|指标|解读|异常/.test(t)) {
      return '报告解读（演示）：把报告拍照上传后，多模态识别会把指标翻译成大白话并标注异常项。\n\n目前雏形里你可以在「我的档案」添加示例报告并点“AI 生成病情摘要”。提醒：AI 解读仅供整理参考，异常指标请以医生解读为准。';
    }
    if (/你好|hello|hi|在吗/.test(t)) {
      return '在的在的～可以问我：找病友、查医院、看药价、聊心情，或者输入“复诊带什么”。';
    }
    const condKeys = {
      acne: ['痤疮','痘痘','异维','粉刺','闭口'], rosacea: ['玫瑰痤疮','潮红','红血丝'],
      urticaria: ['荨麻疹','风团'], ad: ['特应性皮炎','湿疹'],
      as: ['强直','晨僵','脊柱炎'], uc: ['结肠炎','血便','溃结'],
      ems: ['内异','子宫内膜异位','巧克力囊肿','痛经'], migraine: ['偏头痛','头痛','先兆'],
      gout: ['痛风','尿酸']
    };
    for (const cid in condKeys) {
      if (condKeys[cid].some(k => t.indexOf(k) >= 0)) {
        const posts = allPosts().filter(x => x.circle === cid);
        if (!posts.length) break;
        const top = posts.slice().sort((a, b) => ((b.aiSummary ? 1 : 0) - (a.aiSummary ? 1 : 0)) || (b.likes - a.likes))[0];
        const lines = ['「' + circleName(cid) + '」圈里讨论最多的经验：', '《' + top.title + '》（' + top.author + '，' + top.likes + ' 共鸣）'];
        if (top.aiSummary) Object.keys(top.aiSummary).forEach(k => { lines.push('· ' + k + '：' + top.aiSummary[k]); });
        lines.push('\n完整经验见「同舟圈」；个体差异大，具体诊疗请遵专科医生。');
        return lines.join('\n');
      }
    }
    return '这个问题我先记下来了。在雏形里我可以帮你：\n· 「找病友」匹配同阶段病友\n· 「查医院」看口碑与费用\n· 「药价」查医保与替代方案\n· 「聊心情」我会认真听\n\n也可以直接点下方快捷问题试试。正式版将接入真实大模型+医学知识库（RAG）回答。';
  }

  function sendChat(text) {
    text = (text || '').trim();
    if (!text) return;
    state.chat.push({ role: 'me', text: text });
    save(); renderChat();
    const w = $('#chatWindow');
    const typing = document.createElement('div');
    typing.className = 'msg';
    typing.innerHTML = '<div class="msg-avatar">智</div><div class="msg-bubble typing"><i></i><i></i><i></i></div>';
    w.appendChild(typing); w.scrollTop = w.scrollHeight;

    setTimeout(() => {
      state.chat.push({ role: 'ai', text: aiReply(text) });
      save(); renderChat();
    }, 700 + Math.random() * 600);
  }

  /* ---------- 守护 ---------- */
  function renderGuard() {
    $('#guardCards').innerHTML = [
      ['01', '医学审核体系', '经验与评价由 AI 预审 + 医学顾问抽检，标注“病友亲历·已核验 / 待复核”证据等级，夸大宣传自动预警。'],
      ['02', '隐私分级保护', '健康数据仅存于本地或端侧脱敏；连接病友时默认只展示病症、阶段与城市，昵称随时可换。'],
      ['03', 'AI 自迭代闭环', '就医反馈与内容质量信号回流，持续优化匹配与推荐；虚假与广告内容会被识别并标注。']
    ].map(c => '<div class="guard-card"><div class="g-no">' + c[0] + '</div><h4>' + c[1] + '</h4><p>' + c[2] + '</p></div>').join('');
  }

  /* ---------- 事件绑定 ---------- */
  function bindGlobal() {
    $('#nav').addEventListener('click', (e) => {
      const b = e.target.closest('.nav-item'); if (!b) return;
      showView(b.dataset.view);
    });
    document.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) showView(g.dataset.goto);
    });
    $('#btnNewPost').addEventListener('click', openNewPost);
    $('#btnAddReport').addEventListener('click', addSampleReport);
    $('#btnAiSummary').addEventListener('click', aiSummary);
    $('#btnAddMed').addEventListener('click', () => {
      const m = openModal(
        '<h3>添加用药</h3><div class="modal-sub">从演示药库选择，或手动输入</div>' +
        '<div class="modal-body"><div class="form-row"><select class="select" id="amPick">' +
          DB.meds.map(x => '<option>' + esc(x.name) + '</option>').join('') +
          '</select></div><div class="form-row"><input class="input" id="amCustom" placeholder="或手动输入药名"></div></div>' +
        '<div class="modal-foot"><button class="btn" id="amCancel">取消</button><button class="btn btn-primary" id="amAdd">添加</button></div>');
      $('#amCancel', m).addEventListener('click', closeModal);
      $('#amAdd', m).addEventListener('click', () => {
        const name = $('#amCustom', m).value.trim() || $('#amPick', m).value;
        if (state.meds.indexOf(name) < 0) state.meds.push(name);
        save(); closeModal(); renderRecord(); toast('已添加：' + name);
      });
    });
    $('#matchStageFilter').addEventListener('change', renderMatch);
    $('#guideSearch').addEventListener('input', renderGuide);
    $('#guideSort').addEventListener('change', renderGuide);
    $$('#view-guide [data-gtab]').forEach(t => t.addEventListener('click', () => {
      guideTab = t.dataset.gtab; renderGuide();
    }));
    $('#userChip').addEventListener('click', () => { showView('record'); });
    $('#btnChatSend').addEventListener('click', () => { const i = $('#chatInput'); sendChat(i.value); i.value = ''; });
    $('#chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { sendChat($('#chatInput').value); $('#chatInput').value = ''; }
    });
    $('#btnClearChat').addEventListener('click', () => {
      state.chat = []; save(); renderChat(); toast('对话已清空');
    });
  }

  /* ---------- 启动 ---------- */
  bindGlobal();
  renderUser();
  renderView('home');
  if (!state.onboarded) renderOnboard();
})();
