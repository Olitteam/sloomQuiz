/* =========================================================
         1. 관리자 설정 및 상태값
         ========================================================= */
      const SHEET_ID = "1-77nO97ax3J2Ca-ykU7zzTVHWqm8w35cGsCvmHM24_A";

      /* =========================================================
         GA4 / GTM 추적 설정

         - 사이트에 GA4 또는 GTM이 이미 설치되어 있으면 그대로 사용됩니다.
         - 별도 설치가 필요하면 아래 GA_MEASUREMENT_ID에 G-로 시작하는
           측정 ID를 입력하세요. 비워두면 기존 dataLayer만 사용합니다.
         ========================================================= */
      const TRACKING = {
        // 선택 사항: GA4 측정 ID. 사용하지 않으면 빈 값으로 두세요.
        GA_MEASUREMENT_ID: "",

        // 필수: Apps Script를 웹앱으로 배포한 뒤 생성되는 /exec URL을 입력하세요.
        // 예: https://script.google.com/macros/s/XXXXXXXXXXXX/exec
        SHEET_LOG_ENDPOINT: "https://script.google.com/macros/s/AKfycbyVLmYdM_RYEHyRm8Ht5ALdn7iIkzQ5cjI1rN0aBUzuGsyk4imYXyh903Tu7Xsqa4WZ/exec",

        DEBUG: false,
      };

      window.dataLayer = window.dataLayer || [];

      function gtag() {
        window.dataLayer.push(arguments);
      }

      if (TRACKING.GA_MEASUREMENT_ID) {
        const gaScript = document.createElement("script");
        gaScript.async = true;
        gaScript.src =
          `https://www.googletagmanager.com/gtag/js?id=${TRACKING.GA_MEASUREMENT_ID}`;
        document.head.appendChild(gaScript);

        gtag("js", new Date());
        gtag("config", TRACKING.GA_MEASUREMENT_ID);
      }

      // 한 번의 브라우저 방문 세션을 구분하는 ID입니다.
      const recommendationSessionId = (() => {
        const storageKey = "sloom_recommend_session_id";
        let sessionId = sessionStorage.getItem(storageKey);

        if (!sessionId) {
          sessionId =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          sessionStorage.setItem(storageKey, sessionId);
        }

        return sessionId;
      })();

      // 같은 브라우저의 동일 사용자를 구분하는 영구 ID입니다.
      // 브라우저의 쿠키 및 사이트 데이터를 삭제하기 전까지 유지됩니다.
      const recommendationVisitorId = (() => {
        const storageKey = "sloom_recommend_visitor_id";
        let visitorId = localStorage.getItem(storageKey);

        if (!visitorId) {
          visitorId =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem(storageKey, visitorId);
        }

        return visitorId;
      })();

      let recommendationStarted = false;
      let currentRecommendedProduct = "";

      function sendEventToGoogleSheet(eventName, payload) {
        if (!TRACKING.SHEET_LOG_ENDPOINT) {
          if (TRACKING.DEBUG) {
            console.warn(
              "[SLOOM Tracking] SHEET_LOG_ENDPOINT가 비어 있어 시트 기록을 건너뜁니다.",
            );
          }
          return;
        }

        const logData = {
          event_name: eventName,
          session_id: recommendationSessionId,
          user_id: recommendationVisitorId,
          event_time: new Date().toISOString(),
          page_url: window.location.href,
          source: new URLSearchParams(window.location.search).get("utm_source") || "",
          medium: new URLSearchParams(window.location.search).get("utm_medium") || "",
          campaign: new URLSearchParams(window.location.search).get("utm_campaign") || "",
          goal: answers.goal || "",
          lifestyle: answers.lifestyle || "",
          when: answers.when || "",
          posture: answers.posture || "",
          priority: answers.priority || "",
          body: answers.body || "",
          ...payload,
        };

        // Apps Script 웹앱은 응답을 읽지 않는 no-cors 방식으로 전송합니다.
        // 페이지 이동 직전 클릭도 누락되지 않도록 sendBeacon을 우선 사용합니다.
        const body = JSON.stringify(logData);

        if (navigator.sendBeacon) {
          const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
          const sent = navigator.sendBeacon(TRACKING.SHEET_LOG_ENDPOINT, blob);
          if (sent) return;
        }

        fetch(TRACKING.SHEET_LOG_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          keepalive: true,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body,
        }).catch((error) => {
          if (TRACKING.DEBUG) {
            console.error("[SLOOM Tracking] 시트 기록 실패", error);
          }
        });
      }

      function trackEvent(eventName, parameters = {}) {
        const payload = {
          recommendation_session_id: recommendationSessionId,
          ...parameters,
        };

        // 구글 스프레드시트 Event_Log에 실제 사용자 행동을 기록합니다.
        sendEventToGoogleSheet(eventName, parameters);

        // GA4가 설치되어 있다면 이벤트로도 전송됩니다.
        gtag("event", eventName, payload);

        // GTM에서는 event 키를 기준으로 맞춤 이벤트 트리거를 만들 수 있습니다.
        window.dataLayer.push({
          event: eventName,
          ...payload,
        });

        if (TRACKING.DEBUG) {
          console.log(`[SLOOM Tracking] ${eventName}`, payload);
        }
      }

      const CONFIG = {
        questions: [],
        products: {},
        rules: [],
        results: {},
        templates: {},
      };

      let currentStep = 0;
      let answers = {};

      const $ = (selector) => document.querySelector(selector);

      const escapeHtml = (value) =>
        String(value ?? "").replace(
          /[&<>"]/g,
          (character) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
            })[character],
        );

      /* =========================================================
         2. 구글 시트 데이터 불러오기
         ========================================================= */
      function getSheetUrl(sheetName) {
        return (
          `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
          `?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`
        );
      }

      async function fetchSheet(sheetName) {
        const response = await fetch(getSheetUrl(sheetName));
        const text = await response.text();

        const matchedResponse = text.match(
          /setResponse\((.+)\);?\s*$/s,
        );

        const json = JSON.parse(
          matchedResponse
            ? matchedResponse[1]
            : text.slice(text.indexOf("{")),
        );

        const table = json.table || {};
        const rows = (table.rows || []).filter(
          (row) =>
            row.c &&
            row.c.some((cell) => cell?.v != null),
        );

        if (!rows.length) {
          return [];
        }

        // Google Sheets가 첫 행을 헤더로 자동 인식한 경우에는
        // table.cols의 label을 사용합니다.
        const columnLabels = (table.cols || []).map((column) =>
          String(column?.label ?? "").trim(),
        );

        const hasDetectedHeaders = columnLabels.some(Boolean);

        let headers;
        let dataRows;

        if (hasDetectedHeaders) {
          headers = columnLabels.map((label, index) =>
            label || `column_${index + 1}`,
          );
          dataRows = rows;
        } else {
          // 헤더가 자동 인식되지 않은 경우에만 첫 번째 행을 헤더로 사용합니다.
          headers = rows[0].c.map((cell, index) =>
            String(cell?.v ?? `column_${index + 1}`).trim(),
          );
          dataRows = rows.slice(1);
        }

        return dataRows.map((row) =>
          Object.fromEntries(
            headers.map((header, index) => [
              header,
              row.c[index]?.v ?? "",
            ]),
          ),
        );
      }

      function parseQuestions(rows) {
        return rows.map((row) => {
          const options = [];

          for (
            let optionIndex = 1;
            row[`label${optionIndex}`] !== undefined;
            optionIndex += 1
          ) {
            const label = row[`label${optionIndex}`];

            if (!label) {
              continue;
            }

            options.push({
              icon: row[`icon${optionIndex}`] || "",
              label,
              value: String(row[`value${optionIndex}`]),
            });
          }

          return {
            key: row.key,
            text: row.question,
            options,
          };
        });
      }

      /* =========================================================
         3. 전체 데이터 초기화
         ========================================================= */
      async function initialize() {
        try {
          const [
            questionRows,
            productRows,
            ruleRows,
            resultRows,
            templateRows,
          ] = await Promise.all(
            [
              "questions",
              "products",
              "product_rules",
              "product_result",
              "ai_templates",
            ].map(fetchSheet),
          );

          CONFIG.questions = parseQuestions(questionRows);

          productRows.forEach((product) => {
            CONFIG.products[product.key] = product;
          });

          CONFIG.rules = ruleRows
            .map((rule) => ({
              product: String(rule.product ?? "").trim(),
              type: String(rule.type ?? "").trim(),
              value: String(rule.value ?? "").trim(),
              score: Number(rule.score) || 0,
            }))
            .filter(
              (rule) =>
                rule.product &&
                rule.type &&
                rule.value,
            );

          if (!CONFIG.rules.some((rule) => rule.type === "body")) {
            throw new Error(
              "product_rules 시트에서 body 규칙을 읽지 못했습니다. 헤더가 product / type / value / score인지 확인해주세요.",
            );
          }

          resultRows.forEach((result) => {
            CONFIG.results[result.product] = result;
          });

          templateRows.forEach((template) => {
            CONFIG.templates[template.key] = template.text;
          });

          $("#load").classList.remove("on");
          $("#quiz").style.display = "block";

          // 조회수는 동일 브라우저에서 하루 1회만 기록합니다.
          // 같은 날 새로고침하거나 재방문해도 증가하지 않고,
          // 날짜가 바뀐 뒤 다시 방문하면 새로운 page_view를 1회 기록합니다.
          const dailyViewStorageKey = "sloom_recommend_page_view_date";
          const todayKey = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date());

          if (localStorage.getItem(dailyViewStorageKey) !== todayKey) {
            trackEvent("page_view", {
              page_location: window.location.href,
              page_title: document.title,
              visitor_id: recommendationVisitorId,
              unique_view: 1,
              view_date: todayKey,
            });

            localStorage.setItem(dailyViewStorageKey, todayKey);
          }

          // 추천 서비스 진입 이벤트는 방문할 때마다 기록합니다.
          trackEvent("recommend_view", {
            page_location: window.location.href,
            page_title: document.title,
            visitor_id: recommendationVisitorId,
          });

          renderQuestion();
        } catch (error) {
          $("#load").innerHTML = `
            <p>
              데이터를 불러오지 못했어요.<br />
              시트 공유 설정과 시트명을 확인해주세요.
            </p>
          `;

          console.error(error);
        }
      }

      /* =========================================================
         4. 질문 화면 렌더링
         ========================================================= */
      function renderQuestion() {
        const question = CONFIG.questions[currentStep];
        const totalQuestions = CONFIG.questions.length;

        $("#fill").style.width =
          `${((currentStep + 1) / totalQuestions) * 100}%`;

        $("#count").textContent =
          `${currentStep + 1} / ${totalQuestions}`;

        $("#step").innerHTML = `
          <div class="qey">
            QUESTION ${currentStep + 1}
          </div>

          <div class="qtext">
            ${escapeHtml(question.text)}
          </div>

          <div class="opts">
            ${question.options
              .map(
                (option) => `
                  <div
                    class="opt ${
                      answers[question.key] === option.value
                        ? "sel"
                        : ""
                    }"
                    data-value="${escapeHtml(option.value)}"
                  >
                    <div class="ico">
                      ${option.icon}
                    </div>

                    <div>
                      ${escapeHtml(option.label)}
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        `;

        document.querySelectorAll(".opt").forEach((element) => {
          element.addEventListener("click", () => {
            answers[question.key] = element.dataset.value;

            if (!recommendationStarted) {
              recommendationStarted = true;
              trackEvent("recommend_start", {
                first_question: question.key,
              });
            }

            trackEvent("recommend_answer", {
              question_key: question.key,
              answer_value: element.dataset.value,
              question_step: currentStep + 1,
            });

            renderQuestion();
          });
        });

        $("#prev").disabled = currentStep === 0;
        $("#next").disabled =
          answers[question.key] === undefined;

        $("#next").textContent =
          currentStep === totalQuestions - 1
            ? "AI 추천 결과 보기 →"
            : "다음 →";
      }

      /* =========================================================
         5. 이전 / 다음 버튼
         ========================================================= */
      $("#prev").addEventListener("click", () => {
        if (currentStep > 0) {
          currentStep -= 1;
          renderQuestion();
        }
      });

      $("#next").addEventListener("click", () => {
        if (currentStep < CONFIG.questions.length - 1) {
          currentStep += 1;
          renderQuestion();
          return;
        }

        analyzeAnswers();
      });

      /* =========================================================
         6. 제품별 점수 계산
         ========================================================= */
      function getBodyEligibleProductKeys() {
        const selectedBody = String(answers.body || "");
        const selectedGoal = String(answers.goal || "");

        return Object.keys(CONFIG.products).filter((productKey) => {
          /*
           * 바디풀고컷 전용 조건
           *
           * - 목·어깨와 눈에는 사용하지 않으므로 후보에서 완전히 제외
           * - 바디라인·경락 목적을 가장 우선
           * - 순환·붓기 또는 전신 관리 목적에서도 후보 허용
           * - 단순 뭉침 관리 목적이라면 일반 부위 전용 마사지기를 우선
           */
          if (productKey === "body_fullgo_1003") {
            if (selectedBody === "neck" || selectedBody === "eye") {
              return false;
            }

            return (
              selectedGoal === "bodyline" ||
              selectedGoal === "circulation" ||
              selectedBody === "whole"
            );
          }

          /*
           * 일반 제품은 product_rules의 body 규칙이
           * 사용자가 선택한 부위와 일치할 때만 후보가 됩니다.
           */
          return CONFIG.rules.some(
            (rule) =>
              rule.product === productKey &&
              rule.type === "body" &&
              String(rule.value) === selectedBody,
          );
        });
      }

      function getPostureEligibleProductKeys(productKeys) {
        const selectedPosture = String(answers.posture || "");

        if (!selectedPosture || selectedPosture === "any") {
          return productKeys;
        }

        const postureMatchedKeys = productKeys.filter((productKey) =>
          CONFIG.rules.some(
            (rule) =>
              rule.product === productKey &&
              rule.type === "posture" &&
              String(rule.value) === selectedPosture,
          ),
        );

        /*
         * 사용 자세는 필수 조건입니다.
         * 선택한 자세와 일치하는 제품만 후보로 유지하며,
         * 일치 제품이 없더라도 누워서 쓰는 제품 등으로 조건을 완화하지 않습니다.
         */
        return postureMatchedKeys;
      }

      function analyzeAnswers() {
        const candidates = {};

        // 1단계: 선택 부위와 제품 사용 가능 부위로 후보 제한
        const bodyEligibleKeys = getBodyEligibleProductKeys();

        // 2단계: 선택한 사용 자세와 맞는 제품으로 다시 제한
        const eligibleProductKeys =
          getPostureEligibleProductKeys(bodyEligibleKeys);

        eligibleProductKeys.forEach((productKey) => {
          candidates[productKey] = {
            score: 0,
            matches: 0,
            highestMatchedScore: 0,
          };
        });

        // 3단계: 남은 후보 안에서 고민·생활 패턴·사용 시점·기능 점수 합산
        CONFIG.rules.forEach((rule) => {
          const candidate = candidates[rule.product];

          if (!candidate) {
            return;
          }

          if (answers[rule.type] === String(rule.value)) {
            candidate.score += rule.score;
            candidate.matches += 1;
            candidate.highestMatchedScore = Math.max(
              candidate.highestMatchedScore,
              rule.score,
            );
          }
        });

        const ranking = Object.entries(candidates)
          .filter(([, candidate]) => candidate.matches > 0)
          .sort(
            (first, second) =>
              second[1].score - first[1].score ||
              second[1].matches - first[1].matches ||
              second[1].highestMatchedScore -
                first[1].highestMatchedScore,
          );

        if (!ranking.length) {
          showNoResult();
          return;
        }

        const bestProduct = ranking[0];

        /*
         * 결과 화면에서는 별점을 표시하지 않지만,
         * 내부 추천 점수는 로그 분석용으로 유지합니다.
         */
        const maxPossibleScore = Object.entries(answers).reduce(
          (total, [type, value]) =>
            total + getHighestRuleScoreForCandidates(
              type,
              value,
              eligibleProductKeys,
            ),
          0,
        );

        const fitScore = Math.min(
          99,
          Math.max(
            0,
            Math.round(
              (bestProduct[1].score /
                Math.max(maxPossibleScore, 1)) *
                100,
            ),
          ),
        );

        const rankedAlternativeKeys = ranking
          .slice(1, 3)
          .map(([productKey]) => productKey);

        renderResult(
          bestProduct[0],
          fitScore,
          rankedAlternativeKeys,
        );
      }

      function getHighestRuleScoreForCandidates(
        type,
        value,
        eligibleProductKeys,
      ) {
        const eligibleSet = new Set(eligibleProductKeys);

        const scores = CONFIG.rules
          .filter(
            (rule) =>
              eligibleSet.has(rule.product) &&
              rule.type === type &&
              String(rule.value) === String(value),
          )
          .map((rule) => rule.score);

        return scores.length ? Math.max(...scores) : 0;
      }

      function getHighestRuleScore(type, value) {
        const scores = CONFIG.rules
          .filter(
            (rule) =>
              rule.type === type &&
              String(rule.value) === value,
          )
          .map((rule) => rule.score);

        return scores.length ? Math.max(...scores) : 0;
      }

      /* =========================================================
         7. 결과 화면 렌더링
         ========================================================= */
      function renderResult(
        productKey,
        fitScore,
        rankedAlternativeKeys,
      ) {
        const product = CONFIG.products[productKey];
        const result = CONFIG.results[productKey] || {};

        const alternatives = [
          result.alt1,
          result.alt2,
          ...rankedAlternativeKeys,
        ]
          .filter(
            (key, index, array) =>
              key &&
              key !== productKey &&
              array.indexOf(key) === index,
          )
          .slice(0, 2);

        const analysisTexts = [
          CONFIG.templates[`goal_${answers.goal}`],
          CONFIG.templates[`lifestyle_${answers.lifestyle}`],
          CONFIG.templates[`when_${answers.when}`],
          CONFIG.templates[`posture_${answers.posture}`],
          CONFIG.templates[`priority_${answers.priority}`],
          CONFIG.templates[`body_${answers.body}`],
        ].filter(Boolean);

        currentRecommendedProduct = productKey;

        trackEvent("recommend_result", {
          recommended_product: productKey,
          recommended_product_name: product.name,
          recommendation_score: fitScore,
          goal: answers.goal || "",
          lifestyle: answers.lifestyle || "",
          when: answers.when || "",
          posture: answers.posture || "",
          priority: answers.priority || "",
          body: answers.body || "",
        });

        $("#quiz").style.display = "none";
        $("#result").classList.add("on");

        $("#result").innerHTML = `
          <div class="analysis">
            <h3>
              ${escapeHtml(
                CONFIG.templates.analysis_title ||
                  "AI 생활 패턴 분석",
              )}
            </h3>

            ${analysisTexts
              .map(
                (text) => `
                  <p>${escapeHtml(text)}</p>
                `,
              )
              .join("")}
          </div>

          <div class="card">
            <span class="badge">
              🎯
              ${escapeHtml(
                CONFIG.templates.recommend_title ||
                  "가장 잘 맞는 제품",
              )}
            </span>

            <img
              src="${escapeHtml(product.thumb)}"
              alt="${escapeHtml(product.name)}"
            />

            <div class="name">
              ${escapeHtml(product.name)}
            </div>

            <div class="summary">
              <strong>
                ${escapeHtml(
                  result.result_title || "맞춤 추천",
                )}
              </strong>

              <br />

              ${escapeHtml(
                result.summary ||
                  "고객님의 응답과 가장 높은 적합도를 기록한 제품입니다.",
              )}
            </div>

            <div class="sect">
              <h3>
                ${escapeHtml(
                  CONFIG.templates.why_title ||
                    "이런 이유로 추천드려요",
                )}
              </h3>

              <ul class="why">
                ${[result.why1, result.why2, result.why3]
                  .filter(Boolean)
                  .map(
                    (reason) => `
                      <li>${escapeHtml(reason)}</li>
                    `,
                  )
                  .join("")}
              </ul>
            </div>

            <div class="sect">
              <h3>
                ${escapeHtml(
                  CONFIG.templates.tip_title ||
                    "추천 사용 루틴",
                )}
              </h3>

              <div class="tip">
                ${escapeHtml(result.usage_tip)}
              </div>
            </div>

            <a
              class="buy"
              href="${escapeHtml(product.link)}"
              target="_blank"
              rel="noopener"
              onclick="trackProductClick('${escapeHtml(productKey)}', 1, 'main')"
            >
              ${escapeHtml(
                product.link_label || "제품 보러가기",
              )}
              ↗
            </a>
          </div>

          <div class="alts">
            <h3>
              ${escapeHtml(
                CONFIG.templates.alt_title ||
                  "함께 비교해볼 제품",
              )}
            </h3>

            ${alternatives
              .map((alternativeKey, index) =>
                renderAlternativeProduct(
                  alternativeKey,
                  index + 2,
                ),
              )
              .join("")}
          </div>

          <button
            class="restart"
            type="button"
            onclick="restartQuiz()"
          >
            ↺ 처음부터 다시 하기
          </button>
        `;
      }

      function renderAlternativeProduct(productKey, rank) {
        const product = CONFIG.products[productKey];

        if (!product) {
          return "";
        }

        const result = CONFIG.results[productKey] || {};

        return `
          <a
            class="alt"
            href="${escapeHtml(product.link)}"
            target="_blank"
            rel="noopener"
            onclick="trackProductClick('${escapeHtml(productKey)}', ${rank}, 'alternative')"
            style="
              display: flex;
              align-items: center;
              gap: 14px;
              margin-top: 10px;
              padding: 12px;
              border: 1px solid var(--line);
              border-radius: 12px;
              background: #ffffff;
              color: var(--text);
              text-decoration: none;
              transition:
                border-color 0.15s ease,
                transform 0.1s ease;
            "
          >
            <div
              style="
                width: 82px;
                height: 82px;
                flex-shrink: 0;
                overflow: hidden;
                border-radius: 10px;
                background: #f4f1ed;
              "
            >
              <img
                src="${escapeHtml(product.thumb)}"
                alt="${escapeHtml(product.name)}"
                loading="lazy"
                style="
                  display: block;
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                "
              />
            </div>

            <div style="min-width: 0; flex: 1;">
              <div
                style="
                  margin-bottom: 5px;
                  font-size: 14px;
                  font-weight: 700;
                  line-height: 1.45;
                "
              >
                ${escapeHtml(product.name)}
              </div>

              <div
                style="
                  color: var(--sub);
                  font-size: 12px;
                  line-height: 1.55;
                "
              >
                ${escapeHtml(
                  result.result_title ||
                    "다른 조건에 잘 맞는 제품",
                )}
              </div>
            </div>

            <span
              aria-hidden="true"
              style="
                flex-shrink: 0;
                color: var(--muted);
                font-size: 18px;
              "
            >
              →
            </span>
          </a>
        `;
      }

      function trackProductClick(productKey, rank, clickType) {
        const product = CONFIG.products[productKey] || {};

        trackEvent(
          clickType === "main"
            ? "recommend_product_click"
            : "recommend_alt_click",
          {
            recommended_product: currentRecommendedProduct,
            clicked_product: productKey,
            clicked_product_name: product.name || "",
            click_rank: rank,
            click_type: clickType,
              goal: answers.goal || "",
            lifestyle: answers.lifestyle || "",
            when: answers.when || "",
            posture: answers.posture || "",
            priority: answers.priority || "",
            body: answers.body || "",
          },
        );
      }

      function showNoResult() {
        $("#quiz").style.display = "none";
        $("#result").classList.add("on");

        $("#result").innerHTML = `
          <div class="card">
            <div class="name">
              추천 결과를 찾지 못했어요.
            </div>

            <div class="summary">
              선택한 부위와 사용 자세를 모두 만족하는 제품이 없어요.<br />
              사용 방식을 다시 선택해 주세요.
            </div>

            <button
              class="restart"
              type="button"
              onclick="restartQuiz()"
            >
              ↺ 처음부터 다시 하기
            </button>
          </div>
        `;
      }

      /* =========================================================
         8. 설문 초기화
         ========================================================= */
      function restartQuiz() {
        trackEvent("recommend_restart", {
          recommended_product: currentRecommendedProduct,
        });

        currentStep = 0;
        answers = {};
        recommendationStarted = false;
        currentRecommendedProduct = "";

        $("#result").classList.remove("on");
        $("#result").innerHTML = "";
        $("#quiz").style.display = "block";

        renderQuestion();
      }

      /* =========================================================
         9. 실행
         ========================================================= */
      initialize();
