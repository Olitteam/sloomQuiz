/* =========================================================
   1. 관리자 설정 및 상태값
   ========================================================= */

const SHEET_ID =
  "1-77nO97ax3J2Ca-ykU7zzTVHWqm8w35cGsCvmHM24_A";

/* =========================================================
   GA4 / GTM / 구글 시트 추적 설정
   ========================================================= */

const TRACKING = {
  /*
   * 별도로 GA4를 설치할 때만 G-로 시작하는 값을 입력합니다.
   * 사이트에 이미 GA4 또는 GTM이 설치돼 있다면 빈 값으로 둡니다.
   */
  GA_MEASUREMENT_ID: "",

  /*
   * Apps Script 웹 앱 /exec URL
   */
  SHEET_LOG_ENDPOINT:
    "https://script.google.com/macros/s/AKfycbyVLmYdM_RYEHyRm8Ht5ALdn7iIkzQ5cjI1rN0aBUzuGsyk4imYXyh903Tu7Xsqa4WZ/exec",

  DEBUG: false,
};

window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

/*
 * 별도 GA4 측정 ID가 입력된 경우에만
 * gtag.js를 직접 불러옵니다.
 */
if (TRACKING.GA_MEASUREMENT_ID) {
  const gaScript = document.createElement("script");

  gaScript.async = true;
  gaScript.src =
    "https://www.googletagmanager.com/gtag/js?id=" +
    encodeURIComponent(TRACKING.GA_MEASUREMENT_ID);

  document.head.appendChild(gaScript);

  gtag("js", new Date());

  gtag("config", TRACKING.GA_MEASUREMENT_ID, {
    send_page_view: false,
  });
}

/* =========================================================
   방문 세션 ID
   ========================================================= */

const recommendationSessionId = (() => {
  const storageKey = "sloom_recommend_session_id";

  try {
    let sessionId = sessionStorage.getItem(storageKey);

    if (!sessionId) {
      sessionId =
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "rec_" +
            Date.now() +
            "_" +
            Math.random().toString(36).slice(2, 10);

      sessionStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
  } catch (error) {
    return (
      "rec_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }
})();

/* =========================================================
   동일 브라우저 방문자 ID
   ========================================================= */

const recommendationVisitorId = (() => {
  const storageKey = "sloom_recommend_visitor_id";

  try {
    let visitorId = localStorage.getItem(storageKey);

    if (!visitorId) {
      visitorId =
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "visitor_" +
            Date.now() +
            "_" +
            Math.random().toString(36).slice(2, 10);

      localStorage.setItem(storageKey, visitorId);
    }

    return visitorId;
  } catch (error) {
    return (
      "visitor_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 10)
    );
  }
})();

/* =========================================================
   추천 및 이탈 추적 상태값
   ========================================================= */

let recommendationStarted = false;
let recommendationResultShown = false;
let recommendationExitTracked = false;
let recommendationVisitStartedAt = Date.now();

let currentRecommendedProduct = "";

/* =========================================================
   추천 데이터
   ========================================================= */

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
   2. 이벤트 전송
   ========================================================= */

function getUtmParameter(name) {
  try {
    return (
      new URLSearchParams(window.location.search).get(name) || ""
    );
  } catch (error) {
    return "";
  }
}

function sendEventToGoogleSheet(eventName, payload = {}) {
  if (!TRACKING.SHEET_LOG_ENDPOINT) {
    if (TRACKING.DEBUG) {
      console.warn(
        "[SLOOM Tracking] SHEET_LOG_ENDPOINT가 비어 있습니다.",
      );
    }

    return;
  }

  const logData = {
    event_name: eventName,

    session_id: recommendationSessionId,
    recommendation_session_id: recommendationSessionId,

    user_id: recommendationVisitorId,
    visitor_id: recommendationVisitorId,

    event_time: new Date().toISOString(),

    page_url: window.location.href,
    page_location: window.location.href,
    page_title: document.title,

    source: getUtmParameter("utm_source"),
    medium: getUtmParameter("utm_medium"),
    campaign: getUtmParameter("utm_campaign"),

    goal: answers.goal || "",
    lifestyle: answers.lifestyle || "",
    when: answers.when || "",
    posture: answers.posture || "",
    priority: answers.priority || "",
    body: answers.body || "",

    ...payload,
  };

  const body = JSON.stringify(logData);

  /*
   * 페이지 이동이나 종료 직전에도 기록될 수 있도록
   * sendBeacon을 우선 사용합니다.
   */
  if (typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], {
        type: "text/plain;charset=UTF-8",
      });

      const sent = navigator.sendBeacon(
        TRACKING.SHEET_LOG_ENDPOINT,
        blob,
      );

      if (sent) {
        if (TRACKING.DEBUG) {
          console.log(
            "[SLOOM Tracking] Beacon 전송 완료",
            eventName,
            logData,
          );
        }

        return;
      }
    } catch (error) {
      if (TRACKING.DEBUG) {
        console.warn(
          "[SLOOM Tracking] Beacon 전송 실패",
          error,
        );
      }
    }
  }

  fetch(TRACKING.SHEET_LOG_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body,
  }).catch((error) => {
    if (TRACKING.DEBUG) {
      console.error(
        "[SLOOM Tracking] 시트 기록 실패",
        error,
      );
    }
  });
}

function trackEvent(eventName, parameters = {}) {
  const payload = {
    recommendation_session_id: recommendationSessionId,
    visitor_id: recommendationVisitorId,
    ...parameters,
  };

  /*
   * Google Sheets Event_Log
   */
  sendEventToGoogleSheet(eventName, parameters);

  /*
   * GA4
   */
  gtag("event", eventName, payload);

  /*
   * GTM
   */
  window.dataLayer.push({
    event: eventName,
    ...payload,
  });

  if (TRACKING.DEBUG) {
    console.log(
      "[SLOOM Tracking] " + eventName,
      payload,
    );
  }
}

/* =========================================================
   3. 페이지 이탈 추적
   ========================================================= */

function getRecommendationExitStage() {
  if (recommendationResultShown) {
    return "result";
  }

  if (recommendationStarted) {
    return "survey";
  }

  return "landing";
}

function trackRecommendationExit(exitReason) {
  if (recommendationExitTracked) {
    return;
  }

  recommendationExitTracked = true;

  const durationSeconds = Math.max(
    0,
    Math.round(
      (Date.now() - recommendationVisitStartedAt) / 1000,
    ),
  );

  trackEvent("recommend_exit", {
    exit_stage: getRecommendationExitStage(),

    /*
     * 아직 설문을 시작하지 않았다면 0
     */
    exit_step: recommendationStarted
      ? currentStep + 1
      : 0,

    duration_seconds: durationSeconds,
    exit_reason: exitReason || "pagehide",

    recommended_product:
      currentRecommendedProduct || "",

    survey_started: recommendationStarted ? 1 : 0,
    result_shown: recommendationResultShown ? 1 : 0,
  });
}

/*
 * 페이지 종료, 뒤로가기, 외부 페이지 이동
 */
window.addEventListener("pagehide", function () {
  trackRecommendationExit("pagehide");
});

/*
 * pagehide 미지원 환경 보완
 */
window.addEventListener("beforeunload", function () {
  trackRecommendationExit("beforeunload");
});

/*
 * BFCache에서 페이지가 복원된 경우
 * 새로운 이탈 이벤트를 기록할 수 있도록 초기화합니다.
 */
window.addEventListener("pageshow", function (event) {
  if (event.persisted) {
    recommendationExitTracked = false;
    recommendationVisitStartedAt = Date.now();
  }
});

/* =========================================================
   4. 구글 시트 데이터 불러오기
   ========================================================= */

function getSheetUrl(sheetName) {
  return (
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq" +
    "?tqx=out:json&sheet=" +
    encodeURIComponent(sheetName)
  );
}

async function fetchSheet(sheetName) {
  const response = await fetch(getSheetUrl(sheetName));

  if (!response.ok) {
    throw new Error(
      sheetName +
        " 시트를 불러오지 못했습니다. HTTP " +
        response.status,
    );
  }

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
      row.c.some(
        (cell) =>
          cell &&
          cell.v !== null &&
          cell.v !== undefined,
      ),
  );

  if (!rows.length) {
    return [];
  }

  const columnLabels = (table.cols || []).map((column) =>
    String(column?.label ?? "").trim(),
  );

  const hasDetectedHeaders = columnLabels.some(Boolean);

  let headers;
  let dataRows;

  if (hasDetectedHeaders) {
    headers = columnLabels.map((label, index) =>
      label || "column_" + (index + 1),
    );

    dataRows = rows;
  } else {
    headers = rows[0].c.map((cell, index) =>
      String(
        cell?.v ?? "column_" + (index + 1),
      ).trim(),
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
      row["label" + optionIndex] !== undefined;
      optionIndex += 1
    ) {
      const label = row["label" + optionIndex];

      if (!label) {
        continue;
      }

      options.push({
        icon: row["icon" + optionIndex] || "",
        label,
        value: String(
          row["value" + optionIndex] ?? "",
        ),
      });
    }

    return {
      key: String(row.key || "").trim(),
      text: row.question || "",
      options,
    };
  });
}

/* =========================================================
   5. 전체 데이터 초기화
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
      const productKey = String(
        product.key || "",
      ).trim();

      if (!productKey) {
        return;
      }

      CONFIG.products[productKey] = {
        ...product,
        key: productKey,
      };
    });

    CONFIG.rules = ruleRows
      .map((rule) => ({
        product: String(
          rule.product ?? "",
        ).trim(),

        type: String(
          rule.type ?? "",
        ).trim(),

        value: String(
          rule.value ?? "",
        ).trim(),

        score: Number(rule.score) || 0,
      }))
      .filter(
        (rule) =>
          rule.product &&
          rule.type &&
          rule.value,
      );

    if (
      !CONFIG.rules.some(
        (rule) => rule.type === "body",
      )
    ) {
      throw new Error(
        "product_rules 시트에서 body 규칙을 읽지 못했습니다. " +
          "헤더가 product / type / value / score인지 확인해주세요.",
      );
    }

    resultRows.forEach((result) => {
      const productKey = String(
        result.product || "",
      ).trim();

      if (!productKey) {
        return;
      }

      CONFIG.results[productKey] = result;
    });

    templateRows.forEach((template) => {
      const templateKey = String(
        template.key || "",
      ).trim();

      if (!templateKey) {
        return;
      }

      CONFIG.templates[templateKey] =
        template.text || "";
    });

    const loadElement = $("#load");
    const quizElement = $("#quiz");

    if (loadElement) {
      loadElement.classList.remove("on");
    }

    if (quizElement) {
      quizElement.style.display = "block";
    }

    /*
     * 조회수는 동일 브라우저에서 한국 날짜 기준 하루 1회
     */
    const dailyViewStorageKey =
      "sloom_recommend_page_view_date";

    const todayKey = getKoreaDateKey();

    let pageViewAlreadyRecorded = false;

    try {
      pageViewAlreadyRecorded =
        localStorage.getItem(dailyViewStorageKey) ===
        todayKey;
    } catch (error) {
      pageViewAlreadyRecorded = false;
    }

    if (!pageViewAlreadyRecorded) {
      trackEvent("page_view", {
        page_location: window.location.href,
        page_title: document.title,
        visitor_id: recommendationVisitorId,
        unique_view: 1,
        view_date: todayKey,
      });

      try {
        localStorage.setItem(
          dailyViewStorageKey,
          todayKey,
        );
      } catch (error) {
        // 저장 제한 환경은 무시합니다.
      }
    }

    /*
     * 추천 페이지 진입은 방문할 때마다 기록
     */
    trackEvent("recommend_view", {
      page_location: window.location.href,
      page_title: document.title,
      visitor_id: recommendationVisitorId,
      unique_daily_view: pageViewAlreadyRecorded ? 0 : 1,
      product_count: Object.keys(CONFIG.products).length,
    });

    renderQuestion();
  } catch (error) {
    const loadElement = $("#load");

    if (loadElement) {
      loadElement.innerHTML = `
        <p>
          데이터를 불러오지 못했어요.<br />
          시트 공유 설정과 시트명을 확인해주세요.
        </p>
      `;
    }

    console.error(error);
  }
}

function getKoreaDateKey() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (error) {
    const now = new Date();

    const year = now.getFullYear();

    const month = String(
      now.getMonth() + 1,
    ).padStart(2, "0");

    const day = String(
      now.getDate(),
    ).padStart(2, "0");

    return year + "-" + month + "-" + day;
  }
}

/* =========================================================
   6. 질문 화면 렌더링
   ========================================================= */

function renderQuestion() {
  const question = CONFIG.questions[currentStep];

  if (!question) {
    console.error(
      "현재 질문 정보를 찾지 못했습니다.",
      currentStep,
    );

    return;
  }

  const totalQuestions = CONFIG.questions.length;

  const fillElement = $("#fill");
  const countElement = $("#count");
  const stepElement = $("#step");
  const prevButton = $("#prev");
  const nextButton = $("#next");

  if (fillElement) {
    fillElement.style.width =
      ((currentStep + 1) / totalQuestions) *
        100 +
      "%";
  }

  if (countElement) {
    countElement.textContent =
      currentStep + 1 + " / " + totalQuestions;
  }

  if (stepElement) {
    stepElement.innerHTML = `
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
                role="button"
                tabindex="0"
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
  }

  document
    .querySelectorAll(".opt")
    .forEach((element) => {
      const selectOption = () => {
        const selectedValue =
          element.dataset.value || "";

        answers[question.key] = selectedValue;

        /*
         * 첫 답변 선택 시 설문 시작 이벤트
         */
        if (!recommendationStarted) {
          recommendationStarted = true;

          trackEvent("recommend_start", {
            first_question: question.key,
            first_answer: selectedValue,
            question_step: currentStep + 1,
            step: currentStep + 1,
          });
        }

        /*
         * 각 문항 응답 이벤트
         */
        trackEvent("recommend_answer", {
          question_key: question.key,
          answer_value: selectedValue,
          question_step: currentStep + 1,
          step: currentStep + 1,
        });

        /*
         * 첫 질문에서 바디라인·경락 선택 시
         * 바디풀고컷 결과로 즉시 이동
         */
        if (
          question.key === "goal" &&
          selectedValue === "bodyline"
        ) {
          answers.body = "fullbody";
          answers.posture =
            answers.posture || "any";

          renderResult(
            "body_fullgo_1003",
            100,
            ["abdomen", "pelvis"],
          );

          return;
        }

        renderQuestion();
      };

      element.addEventListener(
        "click",
        selectOption,
      );

      element.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            selectOption();
          }
        },
      );
    });

  if (prevButton) {
    prevButton.disabled = currentStep === 0;
  }

  if (nextButton) {
    nextButton.disabled =
      answers[question.key] === undefined;

    nextButton.textContent =
      currentStep === totalQuestions - 1
        ? "AI 추천 결과 보기 →"
        : "다음 →";
  }
}

/* =========================================================
   7. 이전 / 다음 버튼
   ========================================================= */

const prevButton = $("#prev");
const nextButton = $("#next");

if (prevButton) {
  prevButton.addEventListener("click", () => {
    if (currentStep <= 0) {
      return;
    }

    trackEvent("recommend_previous", {
      from_step: currentStep + 1,
      to_step: currentStep,
      question_key:
        CONFIG.questions[currentStep]?.key || "",
    });

    currentStep -= 1;
    renderQuestion();
  });
}

if (nextButton) {
  nextButton.addEventListener("click", () => {
    const question =
      CONFIG.questions[currentStep];

    if (
      !question ||
      answers[question.key] === undefined
    ) {
      return;
    }

    if (
      currentStep <
      CONFIG.questions.length - 1
    ) {
      trackEvent("recommend_next", {
        from_step: currentStep + 1,
        to_step: currentStep + 2,
        question_key: question.key,
      });

      currentStep += 1;
      renderQuestion();

      return;
    }

    analyzeAnswers();
  });
}

/* =========================================================
   8. 제품별 후보 계산
   ========================================================= */

function getBodyEligibleProductKeys() {
  const selectedBody = String(
    answers.body || "",
  );

  const selectedGoal = String(
    answers.goal || "",
  );

  return Object.keys(CONFIG.products).filter(
    (productKey) => {
      /*
       * 바디풀고컷
       */
      if (productKey === "body_fullgo_1003") {
        /*
         * 바디라인·경락 선택 시 우선 추천
         */
        if (selectedGoal === "bodyline") {
          return true;
        }

        /*
         * 목·어깨, 눈 부위 제외
         */
        if (
          selectedBody === "neck" ||
          selectedBody === "eye"
        ) {
          return false;
        }

        return (
          selectedGoal === "circulation" ||
          selectedBody === "fullbody"
        );
      }

      /*
       * 일반 제품은 body 규칙과 선택 부위가
       * 일치하는 경우에만 후보로 등록
       */
      return CONFIG.rules.some(
        (rule) =>
          rule.product === productKey &&
          rule.type === "body" &&
          String(rule.value) === selectedBody,
      );
    },
  );
}

function getPostureEligibleProductKeys(
  productKeys,
) {
  const selectedPosture = String(
    answers.posture || "",
  );

  if (
    !selectedPosture ||
    selectedPosture === "any"
  ) {
    return productKeys;
  }

  const postureMatchedKeys =
    productKeys.filter((productKey) =>
      CONFIG.rules.some(
        (rule) =>
          rule.product === productKey &&
          rule.type === "posture" &&
          String(rule.value) ===
            selectedPosture,
      ),
    );

  /*
   * 선택 자세에 정확히 맞는 제품이 없다면
   * 같은 부위 후보 내에서 추천
   */
  return postureMatchedKeys.length
    ? postureMatchedKeys
    : productKeys;
}

/* =========================================================
   9. 추천 점수 계산
   ========================================================= */

function analyzeAnswers() {
  const candidates = {};

  const bodyEligibleKeys =
    getBodyEligibleProductKeys();

  const eligibleProductKeys =
    getPostureEligibleProductKeys(
      bodyEligibleKeys,
    );

  eligibleProductKeys.forEach((productKey) => {
    candidates[productKey] = {
      score: 0,
      matches: 0,
      highestMatchedScore: 0,
    };
  });

  CONFIG.rules.forEach((rule) => {
    const candidate = candidates[rule.product];

    if (!candidate) {
      return;
    }

    if (
      answers[rule.type] ===
      String(rule.value)
    ) {
      candidate.score += rule.score;
      candidate.matches += 1;

      candidate.highestMatchedScore =
        Math.max(
          candidate.highestMatchedScore,
          rule.score,
        );
    }
  });

  const ranking = Object.entries(candidates)
    .filter(
      ([, candidate]) =>
        candidate.matches > 0,
    )
    .sort(
      (first, second) =>
        second[1].score -
          first[1].score ||
        second[1].matches -
          first[1].matches ||
        second[1].highestMatchedScore -
          first[1].highestMatchedScore,
    );

  /*
   * 규칙 누락 시에도 결과가 비어 있지 않도록
   * 부위별 기본 제품 사용
   */
  if (!ranking.length) {
    const fallbackKey =
      answers.body === "eye"
        ? "eye"
        : answers.body === "hand"
          ? "hand"
          : answers.body === "foot"
            ? "foot_874"
            : answers.body === "back"
              ? "back_636"
              : answers.body === "core"
                ? "abdomen"
                : answers.body === "fullbody"
                  ? "body_fullgo_1003"
                  : "neck_pillow_909";

    trackEvent("recommend_fallback", {
      fallback_product: fallbackKey,
      eligible_product_count:
        eligibleProductKeys.length,
    });

    renderResult(
      fallbackKey,
      70,
      [],
    );

    return;
  }

  const bestProduct = ranking[0];

  const maxPossibleScore =
    Object.entries(answers).reduce(
      (total, [type, value]) =>
        total +
        getHighestRuleScoreForCandidates(
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
  const eligibleSet = new Set(
    eligibleProductKeys,
  );

  const scores = CONFIG.rules
    .filter(
      (rule) =>
        eligibleSet.has(rule.product) &&
        rule.type === type &&
        String(rule.value) ===
          String(value),
    )
    .map((rule) => rule.score);

  return scores.length
    ? Math.max(...scores)
    : 0;
}

function getHighestRuleScore(type, value) {
  const scores = CONFIG.rules
    .filter(
      (rule) =>
        rule.type === type &&
        String(rule.value) ===
          String(value),
    )
    .map((rule) => rule.score);

  return scores.length
    ? Math.max(...scores)
    : 0;
}

/* =========================================================
   10. 결과 화면 렌더링
   ========================================================= */

function renderResult(
  productKey,
  fitScore,
  rankedAlternativeKeys = [],
) {
  const product =
    CONFIG.products[productKey];

  if (!product) {
    console.error(
      "추천 상품 정보를 찾지 못했습니다.",
      productKey,
    );

    showNoResult();

    return;
  }

  const result =
    CONFIG.results[productKey] || {};

  const alternatives = [
    result.alt1,
    result.alt2,
    ...rankedAlternativeKeys,
  ]
    .map((key) =>
      String(key || "").trim(),
    )
    .filter(
      (key, index, array) =>
        key &&
        key !== productKey &&
        CONFIG.products[key] &&
        array.indexOf(key) === index,
    )
    .slice(0, 2);

  const analysisTexts = [
    CONFIG.templates[
      "goal_" + answers.goal
    ],
    CONFIG.templates[
      "lifestyle_" + answers.lifestyle
    ],
    CONFIG.templates[
      "when_" + answers.when
    ],
    CONFIG.templates[
      "posture_" + answers.posture
    ],
    CONFIG.templates[
      "priority_" + answers.priority
    ],
    CONFIG.templates[
      "body_" + answers.body
    ],
  ].filter(Boolean);

  currentRecommendedProduct = productKey;
  recommendationResultShown = true;

  /*
   * 추천 결과 이벤트
   */
  trackEvent("recommend_result", {
    recommended_product: productKey,
    recommended_product_name:
      product.name || "",

    recommendation_score: fitScore,

    /*
     * 기존 KPI가 recommendation_rating을 참조하더라도
     * 추천 점수 데이터가 저장되도록 함께 전달합니다.
     */
    recommendation_rating: fitScore,

    alternative_product_1:
      alternatives[0] || "",

    alternative_product_2:
      alternatives[1] || "",

    goal: answers.goal || "",
    lifestyle: answers.lifestyle || "",
    when: answers.when || "",
    posture: answers.posture || "",
    priority: answers.priority || "",
    body: answers.body || "",
  });

  const quizElement = $("#quiz");
  const resultElement = $("#result");

  if (quizElement) {
    quizElement.style.display = "none";
  }

  if (!resultElement) {
    return;
  }

  resultElement.classList.add("on");

  resultElement.innerHTML = `
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
            result.result_title ||
              "맞춤 추천",
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
          ${[
            result.why1,
            result.why2,
            result.why3,
          ]
            .filter(Boolean)
            .map(
              (reason) => `
                <li>
                  ${escapeHtml(reason)}
                </li>
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
          ${escapeHtml(
            result.usage_tip || "",
          )}
        </div>
      </div>

      <a
        class="buy"
        href="${escapeHtml(product.link)}"
        target="_blank"
        rel="noopener"
        data-track-product="${escapeHtml(productKey)}"
        data-track-rank="1"
        data-track-type="main"
      >
        ${escapeHtml(
          product.link_label ||
            "제품 보러가기",
        )}
        ↗
      </a>
    </div>

    <div class="chatLabel">
      <p>
        <a
          href="https://sloom.channel.io/home"
          target="_blank"
          rel="noopener"
          data-track-consultation="1"
        >
          제품이 더 궁금하시다면 <strong>24시간 1:1 상담</strong>으로<br>  언제든 문의해 주세요.
        </a> 
      </p>
    </div>

    <div class="alts">
      <h3>
        ${escapeHtml(
          CONFIG.templates.alt_title ||
            "함께 추천하는 제품",
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
      data-restart-quiz="1"
    >
      ↺ 처음부터 다시 하기
    </button>
  `;

  bindResultEvents();
}

/* =========================================================
   11. 결과 화면 이벤트 연결
   ========================================================= */

function bindResultEvents() {
  document
    .querySelectorAll(
      "[data-track-product]",
    )
    .forEach((element) => {
      element.addEventListener(
        "click",
        function () {
          const productKey =
            this.dataset.trackProduct || "";

          const rank =
            Number(
              this.dataset.trackRank,
            ) || 1;

          const clickType =
            this.dataset.trackType ||
            "main";

          trackProductClick(
            productKey,
            rank,
            clickType,
          );
        },
      );
    });

  const consultationLink =
    document.querySelector(
      "[data-track-consultation]",
    );

  if (consultationLink) {
    consultationLink.addEventListener(
      "click",
      function () {
        trackEvent(
          "recommend_consultation_click",
          {
            recommended_product:
              currentRecommendedProduct,
          },
        );
      },
    );
  }

  const restartButton =
    document.querySelector(
      "[data-restart-quiz]",
    );

  if (restartButton) {
    restartButton.addEventListener(
      "click",
      restartQuiz,
    );
  }
}

/* =========================================================
   12. 함께 추천하는 제품
   ========================================================= */

function renderAlternativeProduct(
  productKey,
  rank,
) {
  const product =
    CONFIG.products[productKey];

  if (!product) {
    return "";
  }

  const result =
    CONFIG.results[productKey] || {};

  return `
    <a
      class="alt"
      href="${escapeHtml(product.link)}"
      target="_blank"
      rel="noopener"
      data-track-product="${escapeHtml(productKey)}"
      data-track-rank="${rank}"
      data-track-type="alternative"
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

      <div
        style="
          min-width: 0;
          flex: 1;
        "
      >
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

/* =========================================================
   13. 상품 클릭 추적
   ========================================================= */

function trackProductClick(
  productKey,
  rank,
  clickType,
) {
  const product =
    CONFIG.products[productKey] || {};

  const eventName =
    clickType === "main"
      ? "recommend_product_click"
      : "recommend_alt_click";

  trackEvent(eventName, {
    recommended_product:
      currentRecommendedProduct,

    clicked_product: productKey,

    clicked_product_name:
      product.name || "",

    click_rank: rank,
    click_type: clickType,

    goal: answers.goal || "",
    lifestyle: answers.lifestyle || "",
    when: answers.when || "",
    posture: answers.posture || "",
    priority: answers.priority || "",
    body: answers.body || "",
  });
}

/* =========================================================
   14. 결과 없음
   ========================================================= */

function showNoResult() {
  const quizElement = $("#quiz");
  const resultElement = $("#result");

  if (quizElement) {
    quizElement.style.display = "none";
  }

  if (!resultElement) {
    return;
  }

  recommendationResultShown = true;

  trackEvent("recommend_no_result", {
    goal: answers.goal || "",
    lifestyle: answers.lifestyle || "",
    when: answers.when || "",
    posture: answers.posture || "",
    priority: answers.priority || "",
    body: answers.body || "",
  });

  resultElement.classList.add("on");

  resultElement.innerHTML = `
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
        data-restart-quiz="1"
      >
        ↺ 처음부터 다시 하기
      </button>
    </div>
  `;

  const restartButton =
    resultElement.querySelector(
      "[data-restart-quiz]",
    );

  if (restartButton) {
    restartButton.addEventListener(
      "click",
      restartQuiz,
    );
  }
}

/* =========================================================
   15. 설문 초기화
   ========================================================= */

function restartQuiz() {
  trackEvent("recommend_restart", {
    recommended_product:
      currentRecommendedProduct,

    previous_result_shown:
      recommendationResultShown ? 1 : 0,
  });

  currentStep = 0;
  answers = {};

  recommendationStarted = false;
  recommendationResultShown = false;

  currentRecommendedProduct = "";

  const resultElement = $("#result");
  const quizElement = $("#quiz");

  if (resultElement) {
    resultElement.classList.remove("on");
    resultElement.innerHTML = "";
  }

  if (quizElement) {
    quizElement.style.display = "block";
  }

  renderQuestion();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

/* =========================================================
   16. 실행
   ========================================================= */

initialize();
