// CAfe 밸런스 데이터. 숫자 조정은 이 파일에서만 한다.
(function (root) {
  'use strict';
  var D = {};

  // 분류: coffee 커피, tea 논커피·티, ade 에이드·스무디, bakery 베이커리, dessert 디저트
  D.CATS = { coffee: '커피', tea: '논커피·티', ade: '에이드·스무디', bakery: '베이커리', dessert: '디저트' };
  D.isFood = function (cat) { return cat === 'bakery' || cat === 'dessert'; };

  // 메뉴: base=1레벨 판매가, grade=열리는 가게 등급, make=제조 시간(초)
  // shape/c=아이콘 모양과 색 [주색, 보조색, 포인트색]
  D.MENUS = [
    { id: 'americano', name: '아메리카노', cat: 'coffee', unit: '잔', base: 10, grade: 1, make: 2.0, shape: 'mug', c: ['#5a3526'] },
    { id: 'latte', name: '카페라떼', cat: 'coffee', unit: '잔', base: 16, grade: 1, make: 2.4, shape: 'mug', c: ['#c98f62', '#f6ead7'] },
    { id: 'cookie', name: '초코칩 쿠키', cat: 'dessert', unit: '개', base: 14, grade: 1, make: 2.0, shape: 'round', c: ['#d9a066', '#5a3526'] },

    { id: 'vanilla', name: '바닐라라떼', cat: 'coffee', unit: '잔', base: 40, grade: 2, make: 2.6, shape: 'glass', c: ['#e6c98a', '#ffffff', '#e86a5c'] },
    { id: 'icetea', name: '아이스티', cat: 'tea', unit: '잔', base: 44, grade: 2, make: 2.2, shape: 'glass', c: ['#d98a4a', '#f0b070', '#ffcf5c'] },
    { id: 'croissant', name: '크루아상', cat: 'bakery', unit: '개', base: 52, grade: 2, make: 2.0, shape: 'bread', c: ['#e2b07a', '#b9825a'] },

    { id: 'cappuccino', name: '카푸치노', cat: 'coffee', unit: '잔', base: 110, grade: 3, make: 2.6, shape: 'mug', c: ['#f6ead7', '#c98f62'] },
    { id: 'lemonade', name: '레몬에이드', cat: 'ade', unit: '잔', base: 130, grade: 3, make: 2.4, shape: 'glass', c: ['#f5e06a', '#fff7b0', '#7a9e5a'] },
    { id: 'saltbread', name: '소금빵', cat: 'bakery', unit: '개', base: 145, grade: 3, make: 2.0, shape: 'bread', c: ['#edc58a', '#c99a5e'] },

    { id: 'macchiato', name: '카라멜 마키아토', cat: 'coffee', unit: '잔', base: 320, grade: 4, make: 2.8, shape: 'glass', c: ['#c98f62', '#f6ead7', '#b5651d'] },
    { id: 'choco', name: '초코라떼', cat: 'tea', unit: '잔', base: 350, grade: 4, make: 2.6, shape: 'mug', c: ['#6b3f2e', '#f6ead7'] },
    { id: 'scone', name: '스콘', cat: 'bakery', unit: '개', base: 400, grade: 4, make: 2.0, shape: 'bread', c: ['#e6c08a', '#e86a5c'] },
    { id: 'cheesecake', name: '치즈케이크', cat: 'dessert', unit: '조각', base: 500, grade: 4, make: 3.0, shape: 'slice', c: ['#ffe9a8', '#e2b07a', '#e86a5c'] },

    { id: 'coldbrew', name: '콜드브루', cat: 'coffee', unit: '잔', base: 950, grade: 5, make: 2.4, shape: 'glass', c: ['#3b2a20', '#5a3526', '#f6ead7'] },
    { id: 'grapefruit', name: '자몽에이드', cat: 'ade', unit: '잔', base: 1100, grade: 5, make: 2.6, shape: 'glass', c: ['#f08a7a', '#ffc0b0', '#7a9e5a'] },
    { id: 'macaron', name: '마카롱', cat: 'dessert', unit: '개', base: 1500, grade: 5, make: 3.0, shape: 'round', c: ['#f29bb5', '#f6ead7'] },

    { id: 'matcha', name: '말차라떼', cat: 'tea', unit: '잔', base: 3000, grade: 6, make: 2.8, shape: 'mug', c: ['#7a9e5a', '#f6ead7'] },
    { id: 'strawberry', name: '딸기 스무디', cat: 'ade', unit: '잔', base: 3400, grade: 6, make: 3.0, shape: 'glass', c: ['#f08aa0', '#ffd0da', '#e86a5c'] },
    { id: 'financier', name: '휘낭시에', cat: 'bakery', unit: '개', base: 3900, grade: 6, make: 2.2, shape: 'bread', c: ['#d9a066', '#b07a40'] },
    { id: 'tiramisu', name: '티라미수', cat: 'dessert', unit: '조각', base: 4800, grade: 6, make: 3.4, shape: 'slice', c: ['#f6ead7', '#5a3526', '#8a5638'] },

    { id: 'einspanner', name: '아인슈페너', cat: 'coffee', unit: '잔', base: 10000, grade: 7, make: 3.0, shape: 'glass', c: ['#5a3526', '#ffffff', '#f6ead7'] },
    { id: 'milktea', name: '밀크티', cat: 'tea', unit: '잔', base: 11000, grade: 7, make: 2.8, shape: 'glass', c: ['#d9b08a', '#f0d9b5', '#3b2a20'] },
    { id: 'croffle', name: '크로플', cat: 'bakery', unit: '개', base: 14000, grade: 7, make: 2.6, shape: 'stack', c: ['#e2b07a', '#b9825a', '#ffffff'] },

    { id: 'flatwhite', name: '플랫화이트', cat: 'coffee', unit: '잔', base: 36000, grade: 8, make: 2.8, shape: 'mug', c: ['#b98a62', '#f6ead7'] },
    { id: 'yuja', name: '유자차', cat: 'tea', unit: '잔', base: 39000, grade: 8, make: 2.6, shape: 'mug', c: ['#f5d04a', '#fff2b0'] },
    { id: 'mango', name: '망고 스무디', cat: 'ade', unit: '잔', base: 43000, grade: 8, make: 3.0, shape: 'glass', c: ['#f5b030', '#ffdc8a', '#7a9e5a'] },
    { id: 'shortcake', name: '딸기 생크림 케이크', cat: 'dessert', unit: '조각', base: 58000, grade: 8, make: 3.6, shape: 'slice', c: ['#ffffff', '#f6d9b0', '#e86a5c'] },

    { id: 'affogato', name: '아포가토', cat: 'coffee', unit: '잔', base: 130000, grade: 9, make: 3.0, shape: 'bowl', c: ['#f6ead7', '#5a3526'] },
    { id: 'eggtart', name: '에그타르트', cat: 'bakery', unit: '개', base: 150000, grade: 9, make: 2.6, shape: 'round', c: ['#f5d04a', '#c98a1e'] },
    { id: 'souffle', name: '수플레 팬케이크', cat: 'dessert', unit: '접시', base: 210000, grade: 9, make: 4.0, shape: 'stack', c: ['#f0d9b5', '#d9a066', '#ffffff'] },

    { id: 'handdrip', name: '핸드드립 스페셜티', cat: 'coffee', unit: '잔', base: 500000, grade: 10, make: 3.6, shape: 'mug', c: ['#4a2f25', '#ffcf5c'] },
    { id: 'bingsu', name: '팥빙수', cat: 'dessert', unit: '그릇', base: 650000, grade: 10, make: 3.8, shape: 'bowl', c: ['#ffffff', '#8a3b3b'] },
    { id: 'teaset', name: '애프터눈 티 세트', cat: 'dessert', unit: '상', base: 900000, grade: 10, make: 4.5, shape: 'tier', c: ['#f6ead7', '#e86a5c', '#ffcf5c'] }
  ];

  // 가게 등급: need=승급에 필요한 누적 수입, cost=승급 비용 (tools/sim.js 의 CAL=1 로 계산한 값)
  D.GRADES = [
    { name: '작은 카페', need: 0, cost: 0 },
    { name: '동네 카페', need: 4500, cost: 1800 },
    { name: '골목 맛집', need: 620000, cost: 250000 },
    { name: '인기 카페', need: 94000000, cost: 38000000 },
    { name: '소문난 카페', need: 6500000000, cost: 2600000000 },
    { name: '줄 서는 카페', need: 250000000000, cost: 100000000000 },
    { name: '동네 명물', need: 5600000000000, cost: 2200000000000 },
    { name: '도시의 명소', need: 77000000000000, cost: 31000000000000 },
    { name: '전국구 카페', need: 1100000000000000, cost: 450000000000000 },
    { name: '전설의 카페', need: 33000000000000000, cost: 13000000000000000 }
  ];

  // 메뉴 레벨이 이 값에 닿을 때마다 판매가가 2배
  D.MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500];
  D.MENU_MAX = 500;
  D.MENU_COST_MULT = 6;      // 1레벨 강화 비용 = base * 이 값
  D.MENU_COST_GROWTH = 1.13; // 레벨당 비용 증가율
  D.MENU_PRICE_STEP = 0.15;  // 레벨당 판매가 증가(1레벨 대비)

  // 직원: role=serve(서빙)/make(제조)/manage(관리), start=처음 인원, max=최대 인원,
  // grade=고용 가능한 등급, hire=추가 고용 비용(현재 인원 순), train=[교육 기본 비용, 증가율], speed=기본 속도
  D.STAFF = [
    { id: 'alba', name: '대학생 알바', role: 'serve', start: 1, max: 2, grade: 1, hire: [0, 5e4], train: [100, 1.65], speed: 1.1,
      desc: '서빙 · 발이 빠르고 교육비가 저렴' },
    { id: 'mom', name: '주부 파트타이머', role: 'serve', start: 0, max: 1, grade: 2, hire: [3e4], train: [300, 1.7], speed: 0.95,
      desc: '서빙 · 꼼꼼해서 팁이 더 자주, 더 많이' },
    { id: 'barista', name: '바리스타', role: 'make', start: 1, max: 2, grade: 1, hire: [0, 2e5], train: [150, 1.7], speed: 1,
      desc: '음료 제조 · 디저트는 느리게 만듦' },
    { id: 'patissier', name: '파티시에', role: 'make', start: 0, max: 1, grade: 3, hire: [5e5], train: [800, 1.7], speed: 1.3,
      desc: '베이커리·디저트 제조 · 가격도 올려 줌' },
    { id: 'manager', name: '매니저', role: 'manage', start: 0, max: 1, grade: 4, hire: [2e7], train: [5e4, 1.8], speed: 1,
      desc: '전 직원 속도와 오프라인 수입 상승' }
  ];
  D.STAFF_MAX_LV = 30;
  D.STAFF_SPEED_STEP = 0.06;     // 교육 레벨당 속도
  D.OFF_SPECIALTY = 0.5;         // 전문이 아닌 메뉴를 만들 때 속도
  D.OFF_SPECIALTY_WAIT = 4;      // 전문가가 있어도 이만큼 밀리면 다른 직원이 만든다(초)
  D.MOM_TIP_CHANCE = 0.2;        // 주부 파트타이머: 팁 확률 추가
  D.MOM_TIP_STEP = 0.05;         // 주부 파트타이머: 레벨당 팁 금액
  D.PATISSIER_PRICE = [0.2, 0.01]; // 파티시에: 베이커리·디저트 가격 [기본, 레벨당]
  D.MANAGER_SPEED = [0.1, 0.02];   // 매니저: 전 직원 속도 [기본, 레벨당]
  D.MANAGER_OFFLINE = [0.1, 0.007]; // 매니저: 오프라인 수입 비율 추가 [기본, 레벨당] (최대 80%)

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
  D.OFFLINE_RATE_MAX = 0.8;
  D.OFFLINE_MAX = 8 * 3600;
  D.OFFLINE_MIN = 60;

  root.CAFE = root.CAFE || {};
  root.CAFE.D = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
