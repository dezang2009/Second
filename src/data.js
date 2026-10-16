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

  KM.DATA = { SURNAMES, GIVEN_A, GIVEN_B, FORMATIONS, ROLE_FIT, POS_KO, TACTIC_LABELS, ROLE_KO, ROLE_NAME, ROLE_GROUP, fit, LEAGUE_ECON, CLUB_KO };
})(globalThis.KM || (globalThis.KM = {}));
