// Day10 验证：jsdom 加载 study.html，检查词性徽章 + 点选判题仍正常
const { JSDOM } = require('jsdom');
JSDOM.fromFile('E:/work Buddy运行/微信/vibe-coding/study.html', {
  runScripts: 'dangerously',
  resources: 'usable'
}).then(dom => {
  dom.window.addEventListener('load', () => {
    setTimeout(() => {
      const doc = dom.window.document;
      const btns = doc.querySelectorAll('.option-btn');
      const badges = doc.querySelectorAll('.pos-tag');
      console.log('选项数:', btns.length);
      console.log('词性徽章数:', badges.length);
      const texts = [...btns].map(b => b.textContent.trim());
      console.log('选项文本:', texts.join(' | '));
      // 点击第一个按钮，验证判题/标色/反馈没坏
      btns[0].click();
      const fb = doc.getElementById('feedback').textContent;
      const rightN = doc.querySelectorAll('.option-btn.right').length;
      const wrongN = doc.querySelectorAll('.option-btn.wrong').length;
      console.log('点击后反馈:', fb);
      console.log('标绿按钮:', rightN, '标红按钮:', wrongN);
      const nextBtn = doc.getElementById('nextBtn');
      console.log('下一词按钮可见:', nextBtn.style.display !== 'none');
      process.exit(0);
    }, 400);
  });
}).catch(e => { console.error('失败:', e.message); process.exit(1); });
