# CLAUDE.md

## 專案概述

- 個人使用的 **Pokémon GO PvP IV 查詢工具**，改寫自 [pvpivs.com](https://pvpivs.com)（DeathByToast），聚焦在我自己常用的功能。
- 公開網站（歡迎他人使用），但設計決策以自用需求為優先。使用 **Hugo** 建置。

## 技術棧與架構決策

- **Static Site Generator**：Hugo Extended。CI（`.github/workflows/deploy.yml`）的 `HUGO_VERSION` 寫死 0.164.0，對齊本機開發版本以求 build 可重現；升級本機 Hugo 版本時要同步改 CI 的 `HUGO_VERSION`。
- **Theme 策略**：**不使用現成 theme**。所有 layout 皆為自行撰寫的 bare Hugo templates，放在 `layouts/` 底下。修改樣式時直接編輯專案內的 CSS，不透過套件化的 theme 覆寫機制。
- **部署**：GitHub Actions 重新 build 後，以 `upload-pages-artifact` + `deploy-pages` 把 `public/` 送到 GitHub Pages。`public/` 不進版控，不需要 `gh-pages` branch，也不用 `docs/` 資料夾的手動部署方式。
- **網域**：使用 GitHub Pages 預設網域，站台掛在 `/PokeGoPvP/` 子路徑底下（這會影響 `relURL` 的寫法，見「Hugo 慣例」第 2 條）。
- **內容管理**：四個固定工具頁面（見下），內容主要由 template + JS 產生，`content/` 底下的 `.md` 檔案大多只掛 frontmatter（標題、SEO meta）；About 頁例外，帶有實際說明文字。
- **計算邏輯來源**： 參考 [pvpivs.com](https://pvpivs.com) 原始碼 **沒有授權宣告**，只能當作「功能行為參考」，**不可複製或改寫其中任何片段**進本專案，並已由 `.gitignore` 排除、不進版控。實際 CP/IV 計算邏輯與寶可夢基礎數值資料以 **PvPoke**（[github.com/pvpoke/pvpoke](https://github.com/pvpoke/pvpoke)，MIT 授權）為基礎移植/改寫，放在 `static/js/`。

## 資訊架構

| 路徑 | 內容 |
|---|---|
| `/`（首頁） | **PvP IV Rankings**——首頁即工具本體，一進站就能直接查 IV，不做額外的行銷式導覽頁 |
| `/calculator/` | CP／Level 雙向連動計算機 |
| `/search-string/` | 搜尋字串產生器（搜尋 100%/0% IV 全域開關、進化鏈清單勾選＋CP/HP 投影回搜尋物種、Trash String 反向搜尋等，部分沿用原站、部分重新設計，非整組沿用） |
| `/about/` | 關於這個工具 + 致謝 pvpivs.com（DeathByToast）與 PvPoke（MIT） |

四個頁面靠**頂部固定導覽列**互相切換；≤768px 時導覽列收合成漢堡選單（overlay 面板 + scrim），另有不依賴 JS 的 footer 備援連結。

**不做**（不在專案範圍內，未來要新增需確認）：League Rankings（全聯盟 Rank 1）、Type Chart、Type Quiz、tags/分類頁、留言系統、淺色模式切換。

## 視覺系統

沿用使用者在 Claude Design 建立的 **Lamborghini Design System**（純黑畫布、金色 `#FFC000` 唯一強調色且僅限 CTA 按鈕、Saira 字體、大寫標題、零圓角、無陰影靠表面明暗分層）。**純黑是唯一主題，不做淺色模式切換**——原系統本身就是純黑底設計，沒有淡色版本。

Design System 沒有涵蓋資料表／密集表單樣式（原系統是行銷網站語言，不是資料工具），以下是本專案自行推衍、已定案的規則：

- 表頭：12px、大寫、`letter-spacing: 0.96px`、steel `#969696`
- Rankings 結果表名次分級：Top 100 = Cyan Pulse `#29ABE2`（半透明背景+左邊框+文字）；101–500 = 去飽和鵝黃 `#C9AD5F`；501+ = 亮紅 `#FF4444`
- 101–500 的鵝黃是「金色僅限 CTA」規則下唯一的刻意例外，**僅限資料表名次分級使用**，不得擴及其他裝飾用途。它刻意調暗、去飽和以跟鮮豔的 CTA 金拉開差距，並且以半透明色塊+邊框呈現（不是實心填滿+黑字的按鈕形式），避免被誤認成可點擊元素——調整這個顏色時要維持這兩個特性
- **響應式斷點全站只有 768px，一律寫成 `@media (max-width: 768px)`**（包含 768 本身）。不新增第二個斷點值，也不要出現 `min-width: 769px` 這種反向寫法，確保 nav 收合、控制列換行、結果表欄位隱藏在同一個寬度同時發生

## 前端結構

**JS 分層**（`static/js/`）：

- `pvp/`（`cpm`／`stats`／`ranker`／`leagues`）：純計算引擎，不碰 DOM，不依賴頁面
- `pages/*-logic.js`：純函式的頁面邏輯，有對應的 `node --test` 測試
- `pages/<page>.js`：DOM 串接層，只有這一層碰 `document`
- `pages/pokemon-search.js`：Rankings／Calculator／Search String 三頁共用的物種資料載入與自動完成
- `nav.js`：全站導覽列開合邏輯，由 `baseof.html` 載入

新增邏輯時放在對應層級：可以純函式表達的算法一律放 `*-logic.js` 或 `pvp/`（才測得到），不要寫進 DOM 層。

**CSS 分層**（`static/css/`）：`theme-*.css`（design token）→ `base.css`／`nav.css`／`footer.css` → `components-*.css`（跨頁共用元件）→ `pages-*.css`（單頁專屬）。全部由 `layouts/_default/baseof.html` 無條件載入，不做 per-page 條件載入——**新增 `pages-*.css` 時要記得在 `baseof.html` 補一行 `<link>`**。跨頁要共用的樣式放 `components-*.css`，不要從別頁的 `pages-*.css` 借 class。

## Node 工具鏈與測試

- `package.json` 只有 `type: module` 與兩個 script，**不裝任何 npm 套件、沒有 `node_modules`、不引入打包工具**。全部用 ES Modules，瀏覽器端以 `<script type="module">` 載入
- `npm test`：跑 Node 內建的 `node --test`（`test/*.test.mjs`）
- `npm run extract-data`：重跑 `tools/extract-pokemon-data.mjs`，從 PvPoke gamemaster 產生 `static/js/data/pokemon.json`。這份資料是手動重跑更新的，不在 build 流程裡
- **測試只涵蓋純函式模組，DOM 層（`pages/<page>.js`、template、CSS）完全沒有測試涵蓋**。改動模組介面、搬移匯出、重新命名之後，`npm test` 全過**不代表頁面沒壞**——一律要另外開瀏覽器實際載入受影響的頁面，確認 console 無錯誤才算驗證過

## 領域規則

- **等級上限**：引擎 CPM 表涵蓋到 55 級，但遊戲實際可達上限是 51（Best Buddy + XL 糖果）。UI 與頁面邏輯一律限制在 1–51，不要把 52–55 開放給使用者
- **Search String 的兩個等級常數**（`static/js/pages/search-string-logic.js`）刻意分開，且**都不提供 UI（不是下拉選單、也不是網址參數）**，不要合併也不要加回欄位：
  - `RANKING_MAX_LEVEL = 51`：排名用。排名等級一旦封低，CP 上限高的聯盟會有很多物種連滿 IV 都撞不到上限，排名退化成純比 IV 總和
  - `PROJECTION_MAX_LEVEL = 35`：一般模式輸出字串的 CP／HP 投影用，對應野外實際抓得到的等級。Trash 模式的投影則必須改用 `RANKING_MAX_LEVEL`，否則補集尾端等於宣告「練超過 35 級的都可以丟」，會誤刪玩家自己練上去的合格個體
- **未強化的個體一律是整數等級**：野生捕捉、團戰、孵蛋、田野任務產出的都是整數等級，**半級只可能來自強化**。因此 CP／HP 投影一律只枚舉整數等級（`computeProjectedCpHpSets` 的步長是 1），**Trash 模式也一樣**。這跟上面的等級**上限**是兩件事：上限決定列到多高（Trash 仍列到 51），步長決定列不列半級（兩個模式都不列）。
- **IV 欄位命名**：內部資料結構的 key 一律用 `hp`（對齊引擎介面），UI 顯示文字才寫「Sta」。三個頁面共用這個慣例
- **遊戲搜尋字串語法**：整條字串的解析規則是「以 `&` 分隔的 clause 之間是 **AND**，clause 內部以 `,` 分隔的 term 之間是 **OR**」，`,` 的結合力比 `&` 更緊。**不能用逗號把兩段完整條件 OR 起來**——要表達「A 或 B」必須拆成多個 clause 逐項配對。組裝或修改輸出字串前先確認符合這個模型
- **物種錨點一律用 dex 編號**，不用物種名稱：地區形態／Mega 形態的名稱在遊戲搜尋欄裡不是有效詞彙，用名稱當錨點整條字串會比對不到任何東西。代價是同 dex 的其他形態會一起被撈到，這是接受的取捨

## Hugo 慣例

1. **內容頁一律用 `content/<路徑>/index.md`（不加底線），不要用 `_index.md`。** `_index.md` 會讓 Hugo 判定成 section kind，需要額外的 `list.html`/`section.html` 才能渲染；本專案四個路徑都是獨立單頁工具，不是文章列表，`index.md`（leaf bundle）才是對的。
2. **首頁沒有內容檔。**，首頁 title／description 由 hugo.toml 提供。
3. **`relURL` 的輸入字串不要加開頭的 `/`。** 本站部署在 `/PokeGoPvP/` 子路徑下，`{{ "/xxx" | relURL }}` 這種開頭帶 `/` 的字串不會被加上子路徑前綴，會直接 404；要寫成 `{{ "xxx/" | relURL }}`（首頁則是空字串 `""`）。
4. **導覽列的 active 狀態判斷用 `.Path`，不要用 `.Section`。** 本專案的頁面結構下 `.Section` 是空字串，`.Path`（例如 `/about`）才是可用的值。新增頁面時，`nav.html` 與 `footer.html` 都要照 `{{ if eq .Path "/xxx" }} aria-current="page"{{ end }}` 的模式補上。
5. **互動工具頁需要 `layouts/<section>/single.html` 專屬 template。** `_default/single.html` 只渲染 `.Content`，放不下互動 markup；Hugo 會依 section 名稱優先匹配專屬 template。純文字內容頁（如 About）才走 `_default/single.html`。

## 給後續協作者的原則

1. 過程性的設計文件（brainstorm 產出的 spec、plan、交接筆記）不進版控；只有定案的最終成果（本檔案、實際程式碼）才進 git。
2. 新增功能前，先確認是否落在「不做」清單裡，避免與使用者已定案的範圍衝突。
3. 新增內容頁面或修改導覽列前，先看「Hugo 慣例」一節。
4. **新增或修改 UI 功能前先走 `superpowers:brainstorming`**，不要因為「感覺很簡單」就跳過。
5. 直接在 `main` 上開發，不另外開 branch。
6. **Commit 前一定要先給使用者看過確切的 staged 檔案清單與 commit message（含 body），拿到明確同意才能執行 `git commit`。這條規則沒有例外**——即使是 plan/subagent-driven 流程裡「執行到某個 task 就該 commit」的步驟，也要先停下來給使用者確認，不能因為整個 plan 已經核准過就視為每一次 commit 都已經被授權。
7. Commit message **不加 `Co-Authored-By` trailer**；請使用 `git-commit` Skill 來建立。
