// CAfe 밸런스 데이터. 숫자 조정은 이 파일에서만 한다.
(function (root) {
  'use strict';
  var D = {};

  // 메뉴: base=1레벨 판매가, grade=열리는 가게 등급, make=제조 시간(초)
  D.MENUS = [
    { id: 'americano', name: '아메리카노', unit: '잔', base: 10, grade: 1, make: 2.0, color: '#5a3526' },
    { id: 'latte', name: '카페라떼', unit: '잔', base: 16, grade: 1, make: 2.4, color: '#c98f62' },
    { id: 'vanilla', name: '바닐라라떼', unit: '잔', base: 45, grade: 2, make: 2.8, color: '#e6c98a' },
    { id: 'croissant', name: '크루아상', unit: '개', base: 110, grade: 3, make: 2.4, color: '#e2b07a' },
    { id: 'cheesecake', name: '치즈케이크', unit: '조각', base: 320, grade: 4, make: 3.0, color: '#ffe9a8' },
    { id: 'parfait', name: '딸기 파르페', unit: '잔', base: 950, grade: 5, make: 3.4, color: '#e86a5c' },
    { id: 'matcha', name: '말차라떼', unit: '잔', base: 3000, grade: 6, make: 3.0, color: '#7a9e5a' },
    { id: 'tiramisu', name: '티라미수', unit: '조각', base: 10000, grade: 7, make: 3.6, color: '#8a5638' },
    { id: 'souffle', name: '수플레 팬케이크', unit: '접시', base: 36000, grade: 8, make: 4.0, color: '#f0d9b5' },
    { id: 'signature', name: '시그니처 코스', unit: '상', base: 130000, grade: 9, make: 4.5, color: '#ffcf5c' }
  ];

  // 가게 등급: need=승급에 필요한 누적 수입, cost=승급 비용
  D.GRADES = [
    { name: '작은 카페', need: 0, cost: 0 },
    { name: '동네 카페', need: 5000, cost: 2000 },
    { name: '골목 맛집', need: 910000, cost: 360000 },
    { name: '인기 카페', need: 84000000, cost: 33000000 },
    { name: '소문난 카페', need: 5000000000, cost: 2000000000 },
    { name: '줄 서는 카페', need: 150000000000, cost: 61000000000 },
    { name: '동네 명물', need: 2800000000000, cost: 1100000000000 },
    { name: '도시의 명소', need: 47000000000000, cost: 19000000000000 },
    { name: '전국구 카페', need: 1000000000000000, cost: 400000000000000 },
    { name: '전설의 카페', need: 2e16, cost: 8.1e15 }
  ];

  // 메뉴 레벨이 이 값에 닿을 때마다 판매가가 2배
  D.MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500];
  D.MENU_MAX = 500;
  D.MENU_COST_MULT = 6;      // 1레벨 강화 비용 = base * 이 값
  D.MENU_COST_GROWTH = 1.13; // 레벨당 비용 증가율
  D.MENU_PRICE_STEP = 0.15;  // 레벨당 판매가 증가(1레벨 대비)

  D.STAFF_MAX_LV = 30;
  D.STAFF_SPEED_STEP = 0.06;
  D.BARISTA_LV_COST = [150, 1.7];   // [기본, 증가율]
  D.SERVER_LV_COST = [120, 1.7];
  D.HIRE_BARISTA = [2e5, 5e9];      // 2번째, 3번째 고용 비용
  D.HIRE_SERVER = [5e4, 1e9];
  D.TABLE_START = 2;
  D.TABLE_COST = [1500, 3e5, 1e8, 5e10]; // 3,4,5,6번째 테이블
  D.MACHINE_MAX_LV = 15;
  D.MACHINE_COST = [500, 3.2];
  D.MACHINE_SPEED_STEP = 0.04;       // 머신 레벨당 제조 속도
  D.INTERIOR_MAX_LV = 25;
  D.INTERIOR_COST = [300, 2.6];
  D.INTERIOR_ARRIVAL_STEP = 0.10;    // 인테리어 레벨당 손님 방문 빈도
  D.INTERIOR_TIP_STEP = 0.05;

  D.START_COINS = 60;          // 첫 강화를 바로 해볼 수 있게
  D.ARRIVAL_BASE = 4.5;        // 손님 방문 간격(초)
  D.GRADE_PRICE_MULT = 2;      // 등급당 모든 메뉴 판매가 배수
  D.GRADE_ARRIVAL_STEP = 0.08; // 등급당 방문 빈도
  D.QUEUE_MAX = 5;
  D.EAT_TIME = 5.0;
  D.CUSTOMER_SPEED = 34;
  D.SERVER_SPEED = 36;
  D.TIP_CHANCE = 0.35;
  D.TIP_RATE = 0.5;            // 팁 = 판매가 * 이 값
  D.TIP_TTL = 7;
  D.RUSH_GAP = [150, 300];     // 러시 버튼이 뜨는 간격(초)
  D.RUSH_OFFER = 20;           // 러시 버튼 유지 시간
  D.RUSH_TIME = 30;
  D.RUSH_MULT = 2;
  D.OFFLINE_RATE = 0.5;
  D.OFFLINE_MAX = 8 * 3600;
  D.OFFLINE_MIN = 60;

  root.CAFE = root.CAFE || {};
  root.CAFE.D = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
