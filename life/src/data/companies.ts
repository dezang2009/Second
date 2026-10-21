// 실제 기업과 기관. 신입 연봉(만 원)은 대략적인 값이고 게임 속 사건은 모두 가상의 이야기다.
// 로고 파일은 public/logos/에 있고, 없으면 대표색 배지로 보여 준다.

export type CompanyKind = "big" | "it" | "finance" | "public";

export interface Company {
  id: string;
  name: string;
  kind: CompanyKind;
  /** 필기 전형 이름 */
  test: string;
  /** 신입 연봉 */
  salary: number;
  /** 대표색 (로고가 없을 때 배지 색) */
  color: string;
  /** public/logos/ 안의 파일 이름 */
  logo?: string;
  /** 서류 합격이 쉬운 대학 등급 (작을수록 높은 대학). 이보다 낮으면 어렵다 */
  tier: number;
  /** 잘 맞는 전공 계열 */
  fit: Major["field"][];
}

export const COMPANIES: Company[] = [
  { id: "samsung", name: "삼성전자", kind: "big", test: "GSAT", salary: 5300, color: "#1428a0", logo: "samsung.svg", tier: 3, fit: ["공학", "자연"] },
  { id: "skhynix", name: "SK하이닉스", kind: "big", test: "SKCT", salary: 5300, color: "#ea002c", logo: "skhynix.png", tier: 3, fit: ["공학", "자연"] },
  { id: "hyundai", name: "현대자동차", kind: "big", test: "HMAT", salary: 5100, color: "#002c5f", logo: "hyundai.svg", tier: 3, fit: ["공학", "상경"] },
  { id: "lg", name: "LG전자", kind: "big", test: "LG Way Fit", salary: 4700, color: "#a50034", logo: "lg.png", tier: 4, fit: ["공학", "상경"] },
  { id: "lgchem", name: "LG화학", kind: "big", test: "LG Way Fit", salary: 5000, color: "#a50034", logo: "lgchem.png", tier: 3, fit: ["공학", "자연"] },
  { id: "posco", name: "포스코", kind: "big", test: "PAT", salary: 5000, color: "#05507d", logo: "posco.svg", tier: 4, fit: ["공학"] },
  { id: "mobis", name: "현대모비스", kind: "big", test: "HMAT", salary: 4900, color: "#002c5f", logo: "mobis.svg", tier: 4, fit: ["공학"] },
  { id: "skt", name: "SK텔레콤", kind: "big", test: "SKCT", salary: 5300, color: "#ea002c", tier: 3, fit: ["공학", "상경"] },
  { id: "kt", name: "KT", kind: "big", test: "KT 인적성", salary: 4500, color: "#ed1c24", logo: "kt.png", tier: 4, fit: ["공학", "상경", "인문"] },
  { id: "cj", name: "CJ제일제당", kind: "big", test: "CAT", salary: 4300, color: "#e1251b", logo: "cj.png", tier: 4, fit: ["상경", "자연", "인문"] },
  { id: "lotte", name: "롯데", kind: "big", test: "L-TAB", salary: 4200, color: "#e60012", logo: "lotte.svg", tier: 5, fit: ["상경", "인문"] },
  { id: "koreanair", name: "대한항공", kind: "big", test: "인적성 검사", salary: 4600, color: "#00256c", logo: "koreanair.svg", tier: 4, fit: ["공학", "상경", "인문"] },
  { id: "amore", name: "아모레퍼시픽", kind: "big", test: "인적성 검사", salary: 4300, color: "#1b3d6d", tier: 4, fit: ["상경", "자연", "예체능"] },
  { id: "biologics", name: "삼성바이오로직스", kind: "big", test: "GSAT", salary: 5000, color: "#0f4c97", tier: 3, fit: ["자연", "공학"] },
  { id: "naver", name: "네이버", kind: "it", test: "코딩 테스트", salary: 5300, color: "#03c75a", logo: "naver.svg", tier: 4, fit: ["공학"] },
  { id: "kakao", name: "카카오", kind: "it", test: "코딩 테스트", salary: 5100, color: "#fee500", logo: "kakao.svg", tier: 4, fit: ["공학"] },
  { id: "coupang", name: "쿠팡", kind: "it", test: "코딩 테스트", salary: 5000, color: "#e52528", logo: "coupang.svg", tier: 5, fit: ["공학", "상경"] },
  { id: "toss", name: "토스", kind: "it", test: "코딩 테스트", salary: 5500, color: "#0064ff", tier: 4, fit: ["공학", "상경"] },
  { id: "baemin", name: "우아한형제들", kind: "it", test: "코딩 테스트", salary: 4800, color: "#2ac1bc", tier: 5, fit: ["공학"] },
  { id: "nexon", name: "넥슨", kind: "it", test: "코딩 테스트", salary: 5000, color: "#0c3d8c", logo: "nexon.png", tier: 5, fit: ["공학", "예체능"] },
  { id: "ncsoft", name: "엔씨소프트", kind: "it", test: "코딩 테스트", salary: 4800, color: "#262626", tier: 5, fit: ["공학", "예체능"] },
  { id: "hybe", name: "하이브", kind: "it", test: "인적성 검사", salary: 4200, color: "#111111", tier: 5, fit: ["상경", "인문", "예체능"] },
  { id: "shinhan", name: "신한은행", kind: "finance", test: "필기시험(NCS)", salary: 5200, color: "#0046ff", tier: 4, fit: ["상경"] },
  { id: "kb", name: "KB국민은행", kind: "finance", test: "필기시험(NCS)", salary: 5200, color: "#ffbc00", logo: "kb.png", tier: 4, fit: ["상경"] },
  { id: "kepco", name: "한국전력공사", kind: "public", test: "NCS", salary: 4200, color: "#0072bc", logo: "kepco.png", tier: 7, fit: ["공학", "상경"] },
  { id: "airport", name: "인천국제공항공사", kind: "public", test: "NCS", salary: 4600, color: "#0067b1", tier: 7, fit: ["상경", "인문", "공학"] },
];

/** 중소기업·스타트업은 가상의 이름을 쓴다 */
export const SMALL_COMPANIES = ["한빛정밀", "다온소프트", "새솔푸드", "우리물산", "가람테크", "누리디자인", "해든물류", "온새미로"];
export const STARTUPS = ["플로우랩스", "리틀스텝", "모아핀", "브릿지원", "하루랩", "스튜디오 오름"];

export const KIND_LABEL: Record<CompanyKind, string> = { big: "대기업", it: "IT 기업", finance: "은행", public: "공기업" };

/** 회사 직급. 4년쯤마다 진급 심사 */
export const RANKS = ["사원", "대리", "과장", "차장", "부장", "상무", "전무"];
export const CIVIL_RANKS = ["9급 주무관", "8급 주무관", "7급 주무관", "6급 주무관", "5급 사무관", "4급 서기관"];

export function companyById(id: string | undefined): Company | undefined {
  return COMPANIES.find((c) => c.id === id);
}

export interface Major {
  id: string;
  name: string;
  field: "인문" | "상경" | "자연" | "공학" | "의약" | "교육" | "예체능";
}

export const MAJORS: Major[] = [
  { id: "korean", name: "국어국문학과", field: "인문" },
  { id: "english", name: "영어영문학과", field: "인문" },
  { id: "media", name: "미디어커뮤니케이션학과", field: "인문" },
  { id: "business", name: "경영학과", field: "상경" },
  { id: "economics", name: "경제학과", field: "상경" },
  { id: "cs", name: "컴퓨터공학과", field: "공학" },
  { id: "ee", name: "전자공학과", field: "공학" },
  { id: "me", name: "기계공학과", field: "공학" },
  { id: "chem", name: "화학과", field: "자연" },
  { id: "bio", name: "생명과학과", field: "자연" },
  { id: "med", name: "의예과", field: "의약" },
  { id: "pharm", name: "약학과", field: "의약" },
  { id: "nursing", name: "간호학과", field: "의약" },
  { id: "edu", name: "초등교육과", field: "교육" },
  { id: "art", name: "시각디자인과", field: "예체능" },
  { id: "pe", name: "체육학과", field: "예체능" },
];

export function majorById(id: string | undefined): Major | undefined {
  return MAJORS.find((m) => m.id === id);
}

export interface University {
  name: string;
  /** 0이 가장 높음. 7은 전문대 */
  tier: number;
  /** 이공계 중심 대학 (문과는 지원하지 않음) */
  science?: boolean;
}

/** 의과대학이 있는 대학 */
export const MED_SCHOOLS = ["서울대학교", "연세대학교", "고려대학교", "성균관대학교", "울산대학교", "가톨릭대학교", "경희대학교", "한양대학교"];

/** 수능 백분위가 대략 이 정도면 붙는 대학 등급 (게임용 기준) */
export const TIER_CUTOFF = [98.5, 96, 93, 89, 84, 77, 62, 0];

export const UNIVERSITIES: University[] = [
  { name: "서울대학교", tier: 0 },
  { name: "연세대학교", tier: 1 },
  { name: "고려대학교", tier: 1 },
  { name: "KAIST", tier: 1, science: true },
  { name: "POSTECH", tier: 1, science: true },
  { name: "서강대학교", tier: 2 },
  { name: "성균관대학교", tier: 2 },
  { name: "한양대학교", tier: 2 },
  { name: "중앙대학교", tier: 3 },
  { name: "경희대학교", tier: 3 },
  { name: "한국외국어대학교", tier: 3 },
  { name: "서울시립대학교", tier: 3 },
  { name: "이화여자대학교", tier: 3 },
  { name: "건국대학교", tier: 4 },
  { name: "동국대학교", tier: 4 },
  { name: "홍익대학교", tier: 4 },
  { name: "부산대학교", tier: 4 },
  { name: "경북대학교", tier: 4 },
  { name: "국민대학교", tier: 5 },
  { name: "숭실대학교", tier: 5 },
  { name: "세종대학교", tier: 5 },
  { name: "아주대학교", tier: 5 },
  { name: "인하대학교", tier: 5 },
  { name: "충남대학교", tier: 5 },
  { name: "전남대학교", tier: 5 },
  { name: "계명대학교", tier: 6 },
  { name: "영남대학교", tier: 6 },
  { name: "조선대학교", tier: 6 },
  { name: "인하공업전문대학", tier: 7 },
  { name: "영진전문대학교", tier: 7 },
];

export const HIGH_SCHOOLS = {
  general: "일반고",
  private: "자율형 사립고",
  science: "과학고",
  foreign: "외국어고",
  vocational: "특성화고",
  arts: "예술고",
} as const;
export type HighSchool = keyof typeof HIGH_SCHOOLS;
