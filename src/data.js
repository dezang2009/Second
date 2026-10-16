// 정적 데이터: 가상 구단, 이름, 포메이션
(function (KM) {
  'use strict';

  const SURNAMES = '김 이 박 최 정 강 조 윤 장 임 한 오 서 신 권 황 안 송 류 홍 전 고 문 양 손 배 백 허 남 심 노 하 곽 성 차 주 우 구 민 유 나 진 지'.split(' ');
  const GIVEN_A = '민 서 지 현 준 도 우 시 하 주 예 은 승 윤 태 재 동 성 영 정 상 진 경 수 용 기 호 석 종 대 건 한 원 유 규 희 혁 찬 범 형'.split(' ');
  const GIVEN_B = '준 우 호 민 현 진 혁 수 훈 빈 성 원 석 영 재 환 철 규 태 열 기 찬 율 겸 결 후 서 윤 범 균 웅 용 인 일 형 욱 섭 한 완 오'.split(' ');

  // 트랜스퍼마크트 세부 포지션 → 게임 역할
  const ROLE_KO = {
    '골키퍼': 'GK', '중앙 수비수': 'CB', '좌측 풀백': 'LB', '우측 풀백': 'RB',
    '수비형 미드필더': 'DM', '중앙 미드필더': 'CM', '공격형 미드필더': 'AM',
    '좌측 측면 미드필더': 'LM', '우측 측면 미드필더': 'RM', '좌측 윙 포워드': 'LW', '우측 윙 포워드': 'RW',
    '세컨드 스트라이커': 'ST', '중앙 공격수': 'ST', '수비수': 'CB', '미드필더': 'CM', '공격수': 'ST',
  };
  const ROLE_NAME = {
    GK: '골키퍼', CB: '센터백', LB: '레프트백', RB: '라이트백', DM: '수비형 미드필더', CM: '중앙 미드필더',
    AM: '공격형 미드필더', LM: '레프트 미드필더', RM: '라이트 미드필더', LW: '레프트 윙어', RW: '라이트 윙어', ST: '스트라이커',
  };
  const ROLE_GROUP = { GK: 'GK', CB: 'DF', LB: 'DF', RB: 'DF', DM: 'MF', CM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF', LW: 'FW', RW: 'FW', ST: 'FW' };
  // 세부 포지션끼리의 적합도 (같으면 1, 비슷하면 높게)
  const NEAR = {
    CB: { DM: 0.88, LB: 0.84, RB: 0.84 },
    LB: { RB: 0.86, LM: 0.88, CB: 0.84, LW: 0.78 },
    RB: { LB: 0.86, RM: 0.88, CB: 0.84, RW: 0.78 },
    DM: { CM: 0.94, CB: 0.86 },
    CM: { DM: 0.93, AM: 0.92, LM: 0.84, RM: 0.84 },
    AM: { CM: 0.9, ST: 0.86, LW: 0.86, RW: 0.86 },
    LM: { LW: 0.95, LB: 0.84, RM: 0.86, CM: 0.85 },
    RM: { RW: 0.95, RB: 0.84, LM: 0.86, CM: 0.85 },
    LW: { LM: 0.94, RW: 0.9, ST: 0.84, AM: 0.86 },
    RW: { RM: 0.94, LW: 0.9, ST: 0.84, AM: 0.86 },
    ST: { AM: 0.84, LW: 0.82, RW: 0.82 },
    GK: {},
  };
  function fit(slot, p) {
    const r = p.role || p.pos;
    if (slot === r) return 1;
    if (NEAR[slot] && NEAR[slot][r]) return NEAR[slot][r];
    return (ROLE_FIT[slot][p.pos] || 0.5) * 0.9;
  }

  // 리그별 경제 규모 (주간 중계권 기준 배수, 티켓 가격 천 유로)
  const LEAGUE_ECON = {
    GB1: { tv: 1.0, ticket: 0.07, cupName: 'FA컵' },
    ES1: { tv: 0.55, ticket: 0.05, cupName: '코파 델 레이' },
    L1: { tv: 0.5, ticket: 0.04, cupName: 'DFB 포칼' },
    IT1: { tv: 0.5, ticket: 0.04, cupName: '코파 이탈리아' },
    FR1: { tv: 0.35, ticket: 0.035, cupName: '쿠프 드 프랑스' },
    RSK1: { tv: 0.03, ticket: 0.012, cupName: '코리아컵' },
  };

  // 영문 구단명 → 한국어 표기
  const CLUB_KO = {
    'Arsenal FC': '아스널', 'Liverpool FC': '리버풀', 'Newcastle United': '뉴캐슬 유나이티드', 'Brentford FC': '브렌트퍼드',
    'AFC Bournemouth': '본머스', 'Crystal Palace': '크리스털 팰리스', 'Nottingham Forest': '노팅엄 포리스트', 'Sunderland AFC': '선덜랜드',
    'Leeds United': '리즈 유나이티드', 'Everton FC': '에버턴', 'Fulham FC': '풀럼', 'Ipswich Town': '입스위치 타운',
    'Coventry City': '코번트리 시티', 'Hull City': '헐 시티',
    'Real Madrid': '레알 마드리드', 'FC Barcelona': '바르셀로나', 'Atlético de Madrid': '아틀레티코 마드리드', 'Villarreal CF': '비야레알',
    'Real Sociedad': '레알 소시에다드', 'Real Betis Balompié': '레알 베티스', 'Athletic Bilbao': '아틀레틱 빌바오', 'Celta de Vigo': '셀타 비고',
    'Sevilla FC': '세비야', 'Valencia CF': '발렌시아', 'RCD Espanyol Barcelona': '에스파뇰', 'Deportivo A Coruña': '데포르티보 라코루냐',
    'Racing Santander': '라싱 산탄데르', 'Rayo Vallecano': '라요 바예카노', 'Getafe CF': '헤타페', 'Levante UD': '레반테',
    'CA Osasuna': '오사수나', 'Elche CF': '엘체', 'Deportivo Alavés': '알라베스', 'Málaga CF': '말라가',
    'Borussia Dortmund': '도르트문트', 'RB Leipzig': '라이프치히', 'VfB Stuttgart': '슈투트가르트', 'Eintracht Frankfurt': '프랑크푸르트',
    'TSG 1899 Hoffenheim': '호펜하임', 'SC Freiburg': '프라이부르크', 'FC Augsburg': '아우크스부르크', '1.FSV Mainz 05': '마인츠',
    '1.FC Köln': '쾰른', 'Hamburger SV': '함부르크', 'Borussia Mönchengladbach': '묀헨글라트바흐', 'SV Werder Bremen': '베르더 브레멘',
    '1.FC Union Berlin': '우니온 베를린', 'FC Schalke 04': '샬케 04', 'SV 07 Elversberg': '엘버스베르크', 'SC Paderborn 07': '파더보른',
    'Inter Milan': '인테르', 'Como 1907': '코모', 'AC Milan': 'AC 밀란', 'AS Roma': 'AS 로마', 'Atalanta BC': '아탈란타',
    'SSC Napoli': '나폴리', 'ACF Fiorentina': '피오렌티나', 'SS Lazio': '라치오', 'Bologna FC 1909': '볼로냐', 'US Sassuolo': '사수올로',
    'Torino FC': '토리노', 'Genoa CFC': '제노아', 'Udinese Calcio': '우디네세', 'Parma Calcio 1913': '파르마', 'Cagliari Calcio': '칼리아리',
    'Venezia FC': '베네치아', 'Frosinone Calcio': '프로시노네', 'AC Monza': '몬차', 'US Lecce': '레체',
    'AS Monaco': 'AS 모나코', 'RC Strasbourg Alsace': '스트라스부르', 'Stade Rennais FC': '스타드 렌', 'LOSC Lille': '릴',
    'RC Lens': '랑스', 'Paris FC': '파리 FC', 'Olympique Marseille': '마르세유', 'OGC Nice': '니스', 'FC Toulouse': '툴루즈',
    'FC Lorient': '로리앙', 'AJ Auxerre': '오세르', 'Stade Brestois 29': '브레스트', 'Angers SCO': '앙제', 'Le Havre AC': '르아브르',
    'ESTAC Troyes': '트루아', 'Le Mans FC': '르망',
  };

  // 포메이션 슬롯: x = 자기 진영에서의 깊이(0 골문 ~ 1 상대 골문 방향), y = 0 왼쪽 ~ 1 오른쪽 (공격 방향 기준)
  const FORMATIONS = {
    '4-4-2': [
      ['GK', 0.02, 0.5], ['LB', 0.2, 0.12], ['CB', 0.16, 0.38], ['CB', 0.16, 0.62], ['RB', 0.2, 0.88],
      ['LM', 0.5, 0.12], ['CM', 0.45, 0.38], ['CM', 0.45, 0.62], ['RM', 0.5, 0.88],
      ['ST', 0.8, 0.38], ['ST', 0.8, 0.62]],
    '4-3-3': [
      ['GK', 0.02, 0.5], ['LB', 0.2, 0.12], ['CB', 0.16, 0.38], ['CB', 0.16, 0.62], ['RB', 0.2, 0.88],
      ['CM', 0.45, 0.3], ['DM', 0.36, 0.5], ['CM', 0.45, 0.7],
      ['LW', 0.76, 0.15], ['ST', 0.84, 0.5], ['RW', 0.76, 0.85]],
    '4-2-3-1': [
      ['GK', 0.02, 0.5], ['LB', 0.2, 0.12], ['CB', 0.16, 0.38], ['CB', 0.16, 0.62], ['RB', 0.2, 0.88],
      ['DM', 0.36, 0.38], ['DM', 0.36, 0.62],
      ['LW', 0.63, 0.15], ['AM', 0.62, 0.5], ['RW', 0.63, 0.85], ['ST', 0.84, 0.5]],
    '3-5-2': [
      ['GK', 0.02, 0.5], ['CB', 0.16, 0.25], ['CB', 0.14, 0.5], ['CB', 0.16, 0.75],
      ['LM', 0.48, 0.08], ['CM', 0.42, 0.32], ['DM', 0.34, 0.5], ['CM', 0.42, 0.68], ['RM', 0.48, 0.92],
      ['ST', 0.8, 0.38], ['ST', 0.8, 0.62]],
    '5-3-2': [
      ['GK', 0.02, 0.5], ['LB', 0.24, 0.08], ['CB', 0.15, 0.3], ['CB', 0.13, 0.5], ['CB', 0.15, 0.7], ['RB', 0.24, 0.92],
      ['CM', 0.42, 0.3], ['CM', 0.4, 0.5], ['CM', 0.42, 0.7],
      ['ST', 0.78, 0.38], ['ST', 0.78, 0.62]],
    '4-1-4-1': [
      ['GK', 0.02, 0.5], ['LB', 0.2, 0.12], ['CB', 0.16, 0.38], ['CB', 0.16, 0.62], ['RB', 0.2, 0.88],
      ['DM', 0.33, 0.5],
      ['LM', 0.52, 0.12], ['CM', 0.5, 0.38], ['CM', 0.5, 0.62], ['RM', 0.52, 0.88],
      ['ST', 0.84, 0.5]],
  };

  // 역할 → 포지션 그룹 적합도
  const ROLE_FIT = {
    GK: { GK: 1, DF: 0.3, MF: 0.3, FW: 0.3 },
    CB: { DF: 1, MF: 0.82, FW: 0.65, GK: 0.3 },
    LB: { DF: 1, MF: 0.88, FW: 0.72, GK: 0.3 },
    RB: { DF: 1, MF: 0.88, FW: 0.72, GK: 0.3 },
    DM: { MF: 1, DF: 0.92, FW: 0.72, GK: 0.3 },
    CM: { MF: 1, DF: 0.8, FW: 0.82, GK: 0.3 },
    AM: { MF: 1, FW: 0.92, DF: 0.7, GK: 0.3 },
    LM: { MF: 1, FW: 0.94, DF: 0.82, GK: 0.3 },
    RM: { MF: 1, FW: 0.94, DF: 0.82, GK: 0.3 },
    LW: { FW: 1, MF: 0.93, DF: 0.7, GK: 0.3 },
    RW: { FW: 1, MF: 0.93, DF: 0.7, GK: 0.3 },
    ST: { FW: 1, MF: 0.8, DF: 0.6, GK: 0.3 },
  };

  const POS_KO = { GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수' };

  const TACTIC_LABELS = {
    mentality: ['매우 수비적', '수비적', '균형', '공격적', '매우 공격적'],
    style: ['짧은 패스', '혼합', '직선적'],
    press: ['내려앉기', '중간 압박', '전방 압박'],
    line: ['깊게', '보통', '높게'],
    width: ['좁게', '보통', '넓게'],
  };

  // ── 전술 지시 (풋볼 매니저식 팀 지시) ─────────────────────────
  // 각 항목은 경기 엔진의 실제 판단 값에 연결된다 (src/engine.js의 M.params 참고)
  const TACTIC_GROUPS = [
    { key: 'ip', title: '공격 시 (볼 소유)', items: [
      ['mentality', '공격 성향', ['매우 수비적', '수비적', '균형', '공격적', '매우 공격적'], '라인 높이, 슈팅 욕심, 패스 모험 정도'],
      ['passing', '패스 길이', ['훨씬 짧게', '짧게', '보통', '직선적', '훨씬 직선적'], '짧을수록 안전한 패스, 길수록 전진 패스·롱볼'],
      ['tempo', '템포', ['느리게', '보통', '빠르게'], '공을 잡고 판단하는 시간'],
      ['width', '공격 폭', ['좁게', '보통', '넓게'], '공격 시 선수들이 벌어지는 폭'],
      ['approach', '빌드업 방식', ['균형', '후방 빌드업', '공간 침투 패스', '측면 오버랩'], '뒤에서부터 짧게, 수비 뒷공간, 풀백 오버랩'],
      ['finalThird', '파이널 서드', ['균형', '박스까지 파고들기', '보이면 슈팅', '크로스 위주'], '마무리 단계에서의 선택'],
      ['dribble', '드리블', ['자제', '보통', '적극 돌파'], '공을 몰고 전진하는 빈도'],
      ['creative', '창의성', ['규율 중시', '보통', '자유롭게'], '정해진 선택 vs 의외의 선택'],
    ] },
    { key: 'op', title: '수비 시 (볼 미소유)', items: [
      ['block', '수비 블록', ['낮은 블록', '중간 블록', '높은 블록'], '어디서부터 압박을 시작할지'],
      ['line', '수비 라인', ['깊게', '보통', '높게'], '최종 수비 라인의 높이'],
      ['press', '압박 강도', ['자제', '보통', '강하게'], '공 가진 선수에게 붙는 인원과 거리'],
      ['tackle', '태클', ['서서 막기', '보통', '적극 태클'], '태클 빈도·성공률과 파울 위험'],
      ['marking', '마크', ['지역 방어', '타이트 마크'], '위험 지역 공격수를 바짝 붙는지'],
      ['trap', '압박 함정', ['없음', '중앙으로 몰기', '측면으로 몰기'], '상대 패스를 원하는 쪽으로 유도'],
    ] },
    { key: 'tr', title: '전환', items: [
      ['onLoss', '공을 잃었을 때', ['재정비', '균형', '카운터 프레스'], '즉시 되찾기 vs 대형 복귀'],
      ['onWin', '공을 뺏었을 때', ['대형 유지', '균형', '즉시 역습'], '빠른 전진 vs 안정적 소유'],
      ['gk', '골키퍼 배급', ['짧게 빌드업', '균형', '롱킥'], '골키퍼가 공을 잡았을 때'],
    ] },
  ];
  const TACTIC_DEFAULT = { mentality: 2, passing: 2, tempo: 1, width: 1, approach: 0, finalThird: 0, dribble: 1, creative: 1, block: 1, line: 1, press: 1, tackle: 1, marking: 0, trap: 0, onLoss: 1, onWin: 1, gk: 1 };
  const TACTIC_PRESETS = [
    ['gegen', '게겐프레스', '높은 블록과 카운터 프레스로 공을 빨리 되찾아 곧장 찌른다', { mentality: 3, passing: 3, tempo: 2, width: 1, approach: 0, finalThird: 0, dribble: 1, creative: 1, block: 2, line: 2, press: 2, tackle: 2, marking: 0, trap: 1, onLoss: 2, onWin: 2, gk: 1 }],
    ['tiki', '티키타카', '짧은 패스로 점유하고 박스까지 파고든다', { mentality: 2, passing: 0, tempo: 0, width: 0, approach: 1, finalThird: 1, dribble: 0, creative: 2, block: 2, line: 2, press: 2, tackle: 1, marking: 0, trap: 0, onLoss: 2, onWin: 0, gk: 0 }],
    ['vtiki', '수직 티키타카', '짧게 풀어 나오다가 빠르게 수직으로 찌른다', { mentality: 3, passing: 1, tempo: 2, width: 0, approach: 2, finalThird: 1, dribble: 1, creative: 1, block: 1, line: 2, press: 2, tackle: 1, marking: 0, trap: 1, onLoss: 2, onWin: 2, gk: 0 }],
    ['wing', '측면 공격', '넓게 벌리고 풀백 오버랩과 크로스로 공격', { mentality: 3, passing: 2, tempo: 1, width: 2, approach: 3, finalThird: 3, dribble: 1, creative: 1, block: 1, line: 1, press: 1, tackle: 1, marking: 0, trap: 2, onLoss: 1, onWin: 1, gk: 1 }],
    ['direct', '롱볼 다이렉트', '최전방으로 길게, 세컨드 볼 싸움', { mentality: 3, passing: 4, tempo: 2, width: 1, approach: 2, finalThird: 2, dribble: 1, creative: 0, block: 1, line: 1, press: 1, tackle: 2, marking: 0, trap: 0, onLoss: 0, onWin: 2, gk: 2 }],
    ['counter', '유동적 역습', '내려앉아 있다가 공을 뺏으면 빠르게 역습', { mentality: 1, passing: 3, tempo: 2, width: 1, approach: 2, finalThird: 0, dribble: 2, creative: 2, block: 0, line: 0, press: 0, tackle: 1, marking: 0, trap: 0, onLoss: 0, onWin: 2, gk: 2 }],
    ['bus', '텐백 수비', '낮은 블록과 타이트 마크로 실점을 막는다', { mentality: 0, passing: 3, tempo: 1, width: 0, approach: 0, finalThird: 2, dribble: 0, creative: 0, block: 0, line: 0, press: 0, tackle: 2, marking: 1, trap: 0, onLoss: 0, onWin: 0, gk: 2 }],
    ['balance', '균형', '기본 설정', Object.assign({}, TACTIC_DEFAULT)],
  ];
  // 예전 세이브의 전술 값(style 등)을 새 형식으로 맞춘다
  function normTactics(t) {
    for (const k in TACTIC_DEFAULT) if (t[k] == null) t[k] = k === 'passing' && t.style != null ? [0, 2, 4][t.style] : TACTIC_DEFAULT[k];
    t.style = t.passing <= 1 ? 0 : t.passing >= 3 ? 2 : 1;
    return t;
  }

  KM.DATA = { TACTIC_GROUPS, TACTIC_DEFAULT, TACTIC_PRESETS, normTactics, SURNAMES, GIVEN_A, GIVEN_B, FORMATIONS, ROLE_FIT, POS_KO, TACTIC_LABELS, ROLE_KO, ROLE_NAME, ROLE_GROUP, fit, LEAGUE_ECON, CLUB_KO };
})(globalThis.KM || (globalThis.KM = {}));
