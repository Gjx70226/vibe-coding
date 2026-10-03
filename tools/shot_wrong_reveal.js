// 出一张「选错那一屏」的静态样张（jsdom 跑真实交互 → 抓 DOM + 内联样式 → 交给浏览器截图）
// 说明：jsdom 不渲染 CSS，所以这里把 style.css 和页面内联 <style> 一起塞进静态页，
// 截出来的图能证明「排版和颜色对不对」，但**不是手机真机截图**（真机那 3 张还得他自己截）。
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function padLocalStorage(win) {
  const mem = {};
  const ls = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    clear: () => { Object.keys(mem).forEach((k) => { delete mem[k]; }); },
    key: (i) => Object.keys(mem)[i] || null,
    get length() { return Object.keys(mem).length; }
  };
  Object.defineProperty(win, "localStorage", { value: ls, configurable: true });
}

(async () => {
  const dom = await JSDOM.fromFile(path.resolve(ROOT, "index.html"), {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(), beforeParse: padLocalStorage
  });
  const win = dom.window, doc = win.document;
  await new Promise((r) => win.addEventListener("load", r));
  await sleep(700);
  win.location.hash = "#/study";
  await sleep(1200);

  const wrap = doc.getElementById("studyWrap");
  if (!wrap) { console.log("找不到学习页容器"); return; }

  let btns = wrap.querySelectorAll("#qOptions .option-btn");
  if (btns.length) { btns[0].click(); await sleep(150); }
  if (!wrap.querySelector(".option-btn.wrong-tried")) {
    btns = wrap.querySelectorAll("#qOptions .option-btn");
    for (let i = 1; i < btns.length; i++) {
      btns[i].click();
      await sleep(150);
      if (wrap.querySelector(".option-btn.wrong-tried")) break;
    }
  }
  const reveal = wrap.querySelector(".option-btn.wrong-tried .opt-reveal");
  console.log("这一屏摊开的内容：" + ((reveal && reveal.textContent) || "(没有)").trim());
  console.log("反馈条：" + (wrap.querySelector("#qFeedback") || {}).textContent);

  const css = fs.readFileSync(path.resolve(ROOT, "style.css"), "utf8");
  const inPage = Array.prototype.map.call(doc.querySelectorAll("style"), (s) => s.textContent).join("\n");
  const pageHtml = fs.readFileSync(path.resolve(ROOT, "index.html"), "utf8")
    .replace(/<link[^>]*stylesheet[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  const head = pageHtml.slice(0, pageHtml.indexOf("</head>"));
  const body = "<body class=\"mobile\">" +
    '<div class="container">' + wrap.outerHTML + "</div></body></html>";

  fs.mkdirSync(path.resolve(ROOT, "_tmp_shot"), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, "_tmp_shot", "wrong_reveal.html"),
    head + "<style>" + css + "\n" + inPage + "</style>" + body, "utf8");
  console.log("静态样张已生成：_tmp_shot/wrong_reveal.html");
})();
