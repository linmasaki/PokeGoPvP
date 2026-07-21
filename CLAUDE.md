# CLAUDE.md

## 專案概述

**這不是部落格。** 這是一個個人使用的 **Pokémon GO PvP IV 查詢工具**，改寫自開源專案 [pvpivs.com](https://pvpivs.com)（DeathByToast），聚焦在使用者常用的功能，不追求 1:1 複製原站全部功能。公開網站（歡迎他人使用、希望搜尋引擎找得到），但設計決策以自用需求為優先。使用 **Hugo** 建置，部署於 GitHub Pages。

## 技術棧與架構決策

- **Static Site Generator**：Hugo（不指定特定舊版本，跟隨主流/最新穩定版）
- **Theme 策略**：**不使用現成 theme**。所有 layout 皆為自行撰寫的 bare Hugo templates，放在 `layouts/` 底下。修改樣式時直接編輯專案內的 CSS，不透過套件化的 theme 覆寫機制。
- **部署**：透過 **GitHub Actions** 自動 build 並部署到 GitHub Pages（主流做法）。不使用 `docs/` 資料夾或 `gh-pages` branch 的手動部署方式。
- **內容管理**：**沒有 Markdown 部落格文章**。四個固定工具頁面（見下），內容主要由 template + JS 產生，`content/` 底下的 `.md` 檔案只掛 frontmatter（標題、SEO meta）。
- **計算邏輯**：`docs/sample/`（pvpivs.com 參考原始碼）**沒有授權宣告**，不可直接複製/改寫其程式碼，僅能當作「功能行為參考」（了解它怎麼互動），不進版控（需加入 `.gitignore`）。實際 CP/IV 計算邏輯與寶可夢基礎數值資料改以 **PvPoke**（[github.com/pvpoke/pvpoke](https://github.com/pvpoke/pvpoke)，MIT 授權）為基礎移植/改寫，放到 `static/js/`。

## 資訊架構

| 路徑 | 內容 |
|---|---|
| `/`（首頁） | **PvP IV Rankings**——首頁即工具本體，一進站就能直接查 IV，不做額外的行銷式導覽頁 |
| `/calculator/` | CP / 等級 / IV 反推計算機 |
| `/search-string/` | 搜尋字串產生器（League 切換、Trash String、Base Evolution/Baby Form 等設定整組沿用原站） |
| `/about/` | 關於這個工具 + 致敬/註明改寫自 pvpivs.com（DeathByToast） |

四個頁面靠**頂部固定導覽列**互相切換。

**明確排除**（非目前範圍，之後有需要再評估）：League Rankings（全聯盟 Rank 1）、Type Chart、Type Quiz、tags/分類頁、留言系統、淺色模式切換。

## 視覺系統

視覺風格已定案：沿用使用者在 Claude Design 建立的 **Lamborghini Design System**（純黑畫布、金色 `#FFC000` 唯一強調色且僅限 CTA 按鈕、Saira 字體、大寫標題、零圓角、無陰影靠表面明暗分層）。**純黑為唯一主題，不做淺色模式切換**——因為原系統本身就是純黑底設計，沒有淡色版本。

Design System 裡沒有涵蓋資料表／密集表單樣式（原系統是行銷網站語言，不是資料工具），本專案自行推衍出以下規則，並已用實際畫面 demo 確認：

- 表頭：12px、大寫、`letter-spacing: 0.96px`、steel `#969696`
- Rankings 結果表名次分級：Top 100 = Cyan Pulse `#29ABE2`（半透明背景+左邊框+文字）；101–500 = 去飽和鵝黃 `#C9AD5F`（刻意調暗、去飽和，跟鮮豔的 CTA 金拉開差距，避免被誤認成可點擊按鈕——這是「金色僅限 CTA」規則下唯一的刻意例外，僅限資料表分級使用）；501+ = 亮紅 `#FF4444`

## 目前狀態

- [x] 技術棧與部署方式已定案
- [x] 專案範圍已定案（PvP IV 查詢工具，非部落格）
- [x] 視覺風格已定案（Lamborghini Design System）
- [x] 計算引擎資料來源已定案（PvPoke，MIT 授權，取代 docs/sample 的無授權程式碼）
- [ ] `layouts/` 尚未建立（`baseof.html` + 四個工具頁各自的 single template）
- [ ] CP/IV 計算邏輯與基礎數值資料尚未從 PvPoke 移植
- [ ] GitHub Actions workflow 尚未撰寫
- [ ] 這個資料夾尚未初始化 git repo

## 待決事項

- 自訂網域設定尚未決定

## 給後續協作者的原則

1. 不要引入現成 Hugo theme 作為 layout 基礎；所有樣式決策應維持精簡、可讀、易維護，並嚴守 Lamborghini Design System 的 tokens（黑/金/灰階、零圓角、無陰影）。
2. 部署設定一律走 GitHub Actions，不要退回 `docs/` 資料夾或 `gh-pages` branch 的舊做法。
3. `docs/sample/`（pvpivs.com）沒有授權宣告，只能當功能行為參考，不可複製/改寫其程式碼；實際計算邏輯與基礎數值資料以 PvPoke（MIT）為準，移植時重寫進 `static/js/`。
4. 過程性的設計文件（brainstorm 產出的 spec、草稿）不需要進 git；只有定案的最終成果（本檔案、實際程式碼）才進版控。
5. 新增功能前，先確認是否已在「明確排除」清單中列出，避免與使用者尚未拍板的方向衝突。
