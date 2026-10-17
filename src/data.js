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
    '4-4-1-1': [
      ['GK', 0.02, 0.5], ['LB', 0.2, 0.12], ['CB', 0.16, 0.38], ['CB', 0.16, 0.62], ['RB', 0.2, 0.88],
      ['LM', 0.5, 0.12], ['CM', 0.45, 0.38], ['CM', 0.45, 0.62], ['RM', 0.5, 0.88],
      ['AM', 0.66, 0.5], ['ST', 0.84, 0.5]],
    '3-4-3': [
      ['GK', 0.02, 0.5], ['CB', 0.16, 0.25], ['CB', 0.14, 0.5], ['CB', 0.16, 0.75],
      ['LM', 0.46, 0.08], ['CM', 0.4, 0.38], ['CM', 0.4, 0.62], ['RM', 0.46, 0.92],
      ['LW', 0.76, 0.18], ['ST', 0.84, 0.5], ['RW', 0.76, 0.82]],
    '5-4-1': [
      ['GK', 0.02, 0.5], ['LB', 0.22, 0.08], ['CB', 0.15, 0.3], ['CB', 0.13, 0.5], ['CB', 0.15, 0.7], ['RB', 0.22, 0.92],
      ['LM', 0.46, 0.12], ['CM', 0.42, 0.38], ['CM', 0.42, 0.62], ['RM', 0.46, 0.88],
      ['ST', 0.8, 0.5]],
  };


  // ── 선수 역할과 임무 (풋볼 매니저식) ─────────────────────────
  // 역할마다 볼 소유/비소유 시 움직임과 판단 성향이 다르고, 경기 엔진이 그대로 사용한다.
  // adv: 공격 시 전진 거리(m, 임무별) · inside/wide: 중앙/측면으로 좁히거나 벌리는 정도 · drop: 내려와서 받기
  // run: 뒷공간 침투 · pm: 플레이메이커(동료가 이 선수에게 패스를 더 줌) · shoot/drb/cross/prog: 판단 보너스
  // press: 압박 가담 · tackle: 태클 보너스 · aerial: 공중볼 · stay: 수비 시 높이 남아 있기 · keyA: 핵심 세부 능력치
  const DUTY = ['수비', '지원', '공격'];
  const ROLES = {
    gk: { n: '골키퍼', pos: ['GK'], d: [0], desc: '골문을 지키고 안전하게 배급한다', keyA: ['반사신경', '핸들링', '일대일', '위치 선정'] },
    sk: { n: '스위퍼 키퍼', pos: ['GK'], d: [0, 1, 2], adv: [4, 7, 10], sweep: 1, desc: '수비 뒷공간으로 나와 침투 패스를 끊고 짧게 빌드업', keyA: ['반사신경', '일대일', '판단력', '가속도', '킥'] },
    cd: { n: '중앙 수비수', pos: ['CB'], d: [0], desc: '자리를 지키며 안정적으로 막는다', keyA: ['태클', '마킹', '헤딩', '위치 선정', '근력'] },
    bpd: { n: '볼 플레잉 디펜더', pos: ['CB'], d: [0], prog: 0.22, pm: 0.04, desc: '수비 뒤에서 전진 패스로 빌드업을 시작한다', keyA: ['패스', '침착성', '시야', '태클', '마킹'] },
    ncb: { n: '노프릴 센터백', pos: ['CB'], d: [0], prog: -0.25, tackle: 0.05, desc: '위험하면 무조건 걷어낸다. 실수는 적지만 빌드업에 약하다', keyA: ['태클', '헤딩', '근력', '적극성'] },
    wcb: { n: '와이드 센터백', pos: ['CB'], d: [0, 1, 2], adv: [0, 7, 13], wide: 0.25, cross: 0.1, desc: '스리백의 측면에서 공격 시 바깥으로 올라간다', keyA: ['태클', '드리블', '패스', '활동량', '주력'] },
    lib: { n: '리베로', pos: ['CB'], d: [0, 1], adv: [6, 11], inside: 0.4, prog: 0.18, drb: 0.12, pm: 0.08, desc: '공격 시 중원으로 올라가 미드필더처럼 뛴다', keyA: ['패스', '퍼스트 터치', '시야', '판단력', '태클'] },
    fb: { n: '풀백', pos: ['LB', 'RB'], d: [0, 1, 2], adv: [-3, 4, 10], wide: 0.15, cross: 0.08, desc: '측면 수비를 맡고 상황에 따라 공격에 가담', keyA: ['태클', '마킹', '크로스', '위치 선정', '활동량'] },
    wb: { n: '윙백', pos: ['LB', 'RB', 'LM', 'RM'], d: [0, 1, 2], adv: [3, 10, 16], wide: 0.5, cross: 0.28, desc: '터치라인을 오르내리며 측면 폭을 만든다', keyA: ['크로스', '드리블', '활동량', '주력', '지구력'] },
    cwb: { n: '컴플리트 윙백', pos: ['LB', 'RB', 'LM', 'RM'], d: [1, 2], adv: [14, 19], wide: 0.6, cross: 0.32, drb: 0.15, desc: '사실상 윙어처럼 공격하는 풀백. 뒷공간이 비기 쉽다', keyA: ['크로스', '드리블', '기술', '활동량', '지구력'] },
    iwb: { n: '인버티드 윙백', pos: ['LB', 'RB'], d: [0, 1, 2], adv: [2, 6, 12], invert: 1, inside: 0.72, prog: 0.1, pm: 0.06, desc: '공격 시 안쪽으로 좁혀 중앙 미드필더 자리에서 수적 우위를 만든다', keyA: ['패스', '퍼스트 터치', '판단력', '침착성', '태클'] },
    nfb: { n: '노프릴 풀백', pos: ['LB', 'RB'], d: [0], adv: [-5], prog: -0.2, tackle: 0.04, desc: '오버래핑 없이 수비에만 집중한다', keyA: ['태클', '마킹', '위치 선정', '근력'] },
    dm: { n: '수비형 미드필더', pos: ['DM'], d: [0, 1], adv: [-3, 3], tackle: 0.02, desc: '수비 앞을 보호하고 간단히 연결한다', keyA: ['태클', '위치 선정', '판단력', '팀워크', '패스'] },
    anc: { n: '앵커', pos: ['DM'], d: [0], adv: [-6], screen: 1, desc: '수비 라인 앞 중앙을 절대 비우지 않는다', keyA: ['위치 선정', '집중력', '태클', '마킹', '판단력'] },
    hb: { n: '하프백', pos: ['DM'], d: [0], adv: [-4], hb: 1, prog: 0.08, desc: '빌드업 때 센터백 사이로 내려가 스리백을 만든다', keyA: ['위치 선정', '패스', '판단력', '침착성', '태클'] },
    dlp: { n: '딥 라잉 플레이메이커', pos: ['DM', 'CM'], d: [0, 1], adv: [-4, 0], pm: 0.2, prog: 0.16, desc: '깊은 곳에서 공을 받아 경기를 조율한다', keyA: ['패스', '시야', '퍼스트 터치', '침착성', '판단력'] },
    reg: { n: '레지스타', pos: ['DM'], d: [1], adv: [-1], pm: 0.26, prog: 0.24, roam: 3, desc: '자유롭게 움직이며 모험적인 전진 패스를 뿌린다', keyA: ['패스', '시야', '기술', '퍼스트 터치', '판단력'] },
    bwm: { n: '볼 위닝 미드필더', pos: ['DM', 'CM'], d: [0, 1], adv: [-2, 3], tackle: 0.07, press: 1, desc: '공을 가진 상대에게 달려들어 끊어낸다', keyA: ['태클', '적극성', '활동량', '지구력', '팀워크'] },
    sv: { n: '세군도 볼란치', pos: ['DM'], d: [1, 2], adv: [6, 12], run: 0.25, shoot: 0.15, desc: '뒤에서 출발해 박스 근처까지 늦게 침투한다', keyA: ['오프 더 볼', '중거리 슛', '활동량', '태클', '패스'] },
    cm: { n: '중앙 미드필더', pos: ['CM'], d: [0, 1, 2], adv: [-3, 1, 6], desc: '공수 양면에서 균형 있게 움직인다', keyA: ['패스', '퍼스트 터치', '판단력', '팀워크', '태클'] },
    b2b: { n: '박스 투 박스', pos: ['CM'], d: [1], adv: [5], run: 0.2, press: 0.5, roam: 3, shoot: 0.06, desc: '양쪽 박스를 오가며 많이 뛴다. 체력 소모가 크다', keyA: ['활동량', '지구력', '패스', '태클', '오프 더 볼'] },
    mez: { n: '메짤라', pos: ['CM'], d: [1, 2], adv: [6, 11], wide: 0.22, run: 0.25, drb: 0.12, shoot: 0.08, desc: '하프스페이스로 벌려 올라가 측면 공격을 돕는다', keyA: ['드리블', '패스', '오프 더 볼', '기술', '시야'] },
    car: { n: '카릴레로', pos: ['CM'], d: [1], adv: [-1], cover: 1, prog: -0.05, desc: '측면 공간을 덮어 풀백과 윙어를 보좌한다', keyA: ['팀워크', '위치 선정', '활동량', '패스'] },
    ap: { n: '어드밴스드 플레이메이커', pos: ['CM', 'AM', 'LM', 'RM'], d: [1, 2], adv: [3, 7], pm: 0.24, roam: 4, drb: 0.05, desc: '공격 진영 사이 공간에서 공을 받아 결정적인 패스를 노린다', keyA: ['패스', '시야', '기술', '퍼스트 터치', '판단력'] },
    am: { n: '공격형 미드필더', pos: ['AM'], d: [1, 2], adv: [1, 6], shoot: 0.1, desc: '2선에서 연결과 마무리를 모두 한다', keyA: ['패스', '퍼스트 터치', '오프 더 볼', '중거리 슛', '판단력'] },
    ss: { n: '섀도 스트라이커', pos: ['AM'], d: [2], adv: [10], run: 0.4, shoot: 0.22, desc: '공격수 뒤에서 박스로 침투하는 사실상의 두 번째 공격수', keyA: ['오프 더 볼', '마무리', '퍼스트 터치', '침착성', '가속도'] },
    eng: { n: '엔간체', pos: ['AM'], d: [1], adv: [-2], pm: 0.3, prog: 0.1, stay: 4, desc: '움직임은 적지만 모든 공격이 이 선수를 거친다. 수비 가담이 적다', keyA: ['시야', '패스', '기술', '침착성', '퍼스트 터치'] },
    tq: { n: '트레콰르티스타', pos: ['AM', 'ST'], d: [2], adv: [4], pm: 0.22, drb: 0.16, roam: 6, stay: 8, desc: '수비 부담 없이 자유롭게 공격만 한다', keyA: ['기술', '시야', '드리블', '퍼스트 터치', '판단력'] },
    wm: { n: '측면 미드필더', pos: ['LM', 'RM'], d: [0, 1, 2], adv: [-4, 0, 5], cross: 0.1, desc: '측면에서 공수 균형을 맞춘다', keyA: ['크로스', '패스', '활동량', '팀워크', '태클'] },
    wp: { n: '와이드 플레이메이커', pos: ['LM', 'RM'], d: [1, 2], adv: [0, 4], inside: 0.42, pm: 0.2, desc: '측면에서 안쪽으로 들어와 경기를 만든다', keyA: ['패스', '시야', '퍼스트 터치', '기술', '판단력'] },
    dw: { n: '수비형 윙어', pos: ['LM', 'RM'], d: [0, 1], adv: [-3, 1], press: 0.6, tackle: 0.03, cross: 0.06, desc: '측면에서 상대 풀백을 압박하고 수비를 돕는다', keyA: ['활동량', '태클', '팀워크', '크로스', '위치 선정'] },
    w: { n: '윙어', pos: ['LM', 'RM', 'LW', 'RW'], d: [1, 2], adv: [1, 5], wide: 0.5, cross: 0.32, drb: 0.14, desc: '터치라인까지 돌파해 크로스를 올린다', keyA: ['크로스', '드리블', '가속도', '주력', '기술'] },
    if: { n: '인사이드 포워드', pos: ['LW', 'RW', 'LM', 'RM'], d: [1, 2], adv: [3, 7], inside: 0.42, cut: 1, run: 0.3, shoot: 0.24, drb: 0.18, cross: -0.15, desc: '안쪽으로 파고들어 직접 슈팅한다', keyA: ['마무리', '드리블', '오프 더 볼', '가속도', '기술'] },
    iw: { n: '인버티드 윙어', pos: ['LW', 'RW', 'LM', 'RM'], d: [1, 2], adv: [1, 4], inside: 0.3, cut: 1, pm: 0.06, drb: 0.14, shoot: 0.1, cross: -0.1, desc: '안쪽으로 접고 들어와 패스와 슈팅을 섞는다', keyA: ['드리블', '패스', '기술', '시야', '퍼스트 터치'] },
    wtf: { n: '와이드 타깃맨', pos: ['LW', 'RW', 'LM', 'RM'], d: [1, 2], adv: [3, 6], wide: 0.3, aerial: 0.35, desc: '측면에서 롱볼을 받아내고 공중볼을 따낸다', keyA: ['헤딩', '근력', '점프', '밸런스'] },
    rmd: { n: '라움도이터', pos: ['LW', 'RW', 'AM'], d: [2], adv: [9], inside: 0.32, run: 0.5, shoot: 0.26, roam: 5, stay: 6, desc: '공간을 찾아다니며 침투해 마무리한다. 수비는 거의 하지 않는다', keyA: ['오프 더 볼', '마무리', '판단력', '침착성', '집중력'] },
    af: { n: '어드밴스드 포워드', pos: ['ST'], d: [2], adv: [3], run: 0.5, shoot: 0.12, desc: '최종 수비 라인과 경쟁하며 뒷공간을 노린다', keyA: ['오프 더 볼', '마무리', '가속도', '드리블', '침착성'] },
    pch: { n: '포처', pos: ['ST'], d: [2], adv: [4], box: 1, run: 0.32, shoot: 0.32, pm: -0.05, desc: '박스 안에 머물며 마무리에만 집중한다', keyA: ['마무리', '오프 더 볼', '침착성', '가속도'] },
    tm: { n: '타깃맨', pos: ['ST'], d: [1, 2], adv: [-1, 2], aerial: 0.45, holdX: 0.3, pm: 0.06, desc: '등지고 공을 지켜내고 공중볼을 따낸다', keyA: ['헤딩', '근력', '점프', '밸런스', '팀워크'] },
    f9: { n: '폴스 나인', pos: ['ST'], d: [1], adv: [0], drop: 12, pm: 0.18, drb: 0.1, desc: '미드필드로 내려와 상대 센터백을 끌어내고 2선의 침투를 연다', keyA: ['패스', '시야', '기술', '퍼스트 터치', '드리블'] },
    dlf: { n: '딥 라잉 포워드', pos: ['ST'], d: [1, 2], adv: [0, 3], drop: 7, pm: 0.12, holdX: 0.15, desc: '내려와서 받아 연계한 뒤 다시 침투한다', keyA: ['퍼스트 터치', '패스', '팀워크', '침착성', '마무리'] },
    pf: { n: '프레싱 포워드', pos: ['ST'], d: [0, 1, 2], adv: [-3, 0, 3], press: 1, tackle: 0.04, desc: '최전방부터 수비수와 골키퍼를 쉬지 않고 압박한다', keyA: ['활동량', '적극성', '지구력', '가속도', '팀워크'] },
    cf: { n: '컴플리트 포워드', pos: ['ST'], d: [1, 2], adv: [1, 4], shoot: 0.16, pm: 0.08, drb: 0.1, aerial: 0.15, desc: '연계·드리블·공중볼·마무리를 모두 해내는 만능 공격수', keyA: ['마무리', '퍼스트 터치', '기술', '헤딩', '판단력'] },
  };
  const ROLE_AB = { gk: 'GK', sk: 'SK', cd: 'CD', bpd: 'BPD', ncb: 'NCB', wcb: 'WCB', lib: 'LIB', fb: 'FB', wb: 'WB', cwb: 'CWB', iwb: 'IWB', nfb: 'NFB', dm: 'DM', anc: 'A', hb: 'HB', dlp: 'DLP', reg: 'RGA', bwm: 'BWM', sv: 'SV', cm: 'CM', b2b: 'BBM', mez: 'MEZ', car: 'CAR', ap: 'AP', am: 'AM', ss: 'SS', eng: 'ENG', tq: 'T', wm: 'WM', wp: 'WP', dw: 'DW', w: 'W', if: 'IF', iw: 'IW', wtf: 'WTF', rmd: 'RMD', af: 'AF', pch: 'P', tm: 'TM', f9: 'F9', dlf: 'DLF', pf: 'PF', cf: 'CF' };
  const DEFAULT_ROLE = { GK: ['gk', 0], CB: ['cd', 0], LB: ['fb', 1], RB: ['fb', 1], DM: ['dm', 0], CM: ['cm', 1], AM: ['am', 1], LM: ['wm', 1], RM: ['wm', 1], LW: ['w', 2], RW: ['w', 2], ST: ['af', 2] };
  function rolesFor(pos) { return Object.keys(ROLES).filter((k) => ROLES[k].pos.includes(pos)); }
  function validRole(pos, r) {
    if (!r || !ROLES[r[0]] || !ROLES[r[0]].pos.includes(pos)) return DEFAULT_ROLE[pos].slice();
    const def = ROLES[r[0]];
    return [r[0], def.d.includes(r[1]) ? r[1] : def.d[Math.min(def.d.length - 1, 1)]];
  }
  // 엔진에서 쓰는 역할 수치 (임무 반영)
  function roleMods(r) {
    const def = ROLES[r[0]];
    const i = Math.max(0, def.d.indexOf(r[1]));
    const o = { key: r[0], duty: r[1], adv: def.adv ? def.adv[Math.min(i, def.adv.length - 1)] : 0 };
    for (const k of ['inside', 'wide', 'drop', 'run', 'pm', 'shoot', 'drb', 'cross', 'cut', 'press', 'tackle', 'aerial', 'prog', 'sweep', 'roam', 'stay', 'holdX', 'invert', 'hb', 'screen', 'box', 'cover']) o[k] = def[k] || 0;
    // 공격 임무는 침투·슈팅 성향이 조금 더 강하고, 수비 임무는 자리를 지킨다
    if (r[1] === 2) { o.run += 0.08; o.shoot += 0.04; }
    if (r[1] === 0) { o.stay = Math.min(o.stay, 0); o.run *= 0.5; }
    return o;
  }

  // 공격 시 포메이션 슬롯 → 수비 시 포메이션 슬롯 대응 (가까운 자리끼리 짝짓기)
  function shapeMap(from, to) {
    const out = new Array(from.length).fill(null);
    const used = new Set();
    out[0] = to[0]; used.add(0);
    const pairs = [];
    for (let i = 1; i < from.length; i++) for (let j = 1; j < to.length; j++) {
      const dx = (from[i][1] - to[j][1]) * 1.2, dy = from[i][2] - to[j][2];
      pairs.push([dx * dx + dy * dy, i, j]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of pairs) { if (out[i] || used.has(j)) continue; out[i] = to[j]; used.add(j); }
    return out;
  }


  // ── 라이벌전 (더비) : [구단, 구단, 이름, 열기 1~3] ─────────────
  const RIVALS = [
    ['아스널', '토트넘 홋스퍼', '북런던 더비', 3], ['맨체스터 시티', '맨체스터 유나이티드', '맨체스터 더비', 3],
    ['리버풀', '에버턴', '머지사이드 더비', 3], ['리버풀', '맨체스터 유나이티드', '노스웨스트 더비', 3],
    ['뉴캐슬 유나이티드', '선덜랜드', '타인-위어 더비', 3], ['첼시', '토트넘 홋스퍼', '런던 더비', 2], ['아스널', '첼시', '런던 더비', 2],
    ['리즈 유나이티드', '맨체스터 유나이티드', '장미 더비', 2], ['크리스털 팰리스', '브라이턴 & 호브 앨비언', 'M23 더비', 2], ['맨체스터 시티', '리버풀', '잉글랜드 빅매치', 2],
    ['레알 마드리드', '바르셀로나', '엘 클라시코', 3], ['레알 마드리드', '아틀레티코 마드리드', '마드리드 더비', 3],
    ['세비야', '레알 베티스', '세비야 더비', 3], ['아틀레틱 빌바오', '레알 소시에다드', '바스크 더비', 3],
    ['바르셀로나', '에스파뇰', '카탈루냐 더비', 2], ['발렌시아', '비야레알', '발렌시아 더비', 2], ['데포르티보 라코루냐', '셀타 비고', '갈리시아 더비', 3],
    ['도르트문트', '바이에른 뮌헨', '데어 클라시커', 3], ['도르트문트', '샬케 04', '레비어 더비', 3],
    ['함부르크', '베르더 브레멘', '북부 더비', 2], ['쾰른', '묀헨글라트바흐', '라인 더비', 2], ['바이어 레버쿠젠', '쾰른', '라인 더비', 2],
    ['인테르', 'AC 밀란', '밀라노 더비', 3], ['AS 로마', '라치오', '로마 더비', 3], ['유벤투스', '인테르', '이탈리아 더비', 3],
    ['유벤투스', '토리노', '토리노 더비', 3], ['나폴리', '유벤투스', '남북 더비', 2],
    ['파리 생제르맹', '마르세유', '르 클라시크', 3], ['올랭피크 리옹', '마르세유', '올랭피코', 2], ['니스', 'AS 모나코', '코트다쥐르 더비', 2],
    ['랑스', '릴', '북부 더비', 3], ['파리 생제르맹', '파리 FC', '파리 더비', 2],
    ['전북 현대 모터스', '울산 HD', '현대가 더비', 3], ['울산 HD', '포항 스틸러스', '동해안 더비', 3], ['서울', '안양', '연고지 더비', 3], ['인천 유나이티드', '서울', '경인 더비', 2],
    ['레알 마드리드', '바이에른 뮌헨', '유럽의 클라시코', 2], ['바르셀로나', '파리 생제르맹', '유럽 빅매치', 2], ['리버풀', '레알 마드리드', '유럽 빅매치', 2],
  ];


  // ── 구단별 실제 전술 성향 (2025/26 시즌 감독 스타일을 참고한 근사치) ──
  // [프리셋, 주 포메이션, 덧붙일 지시]
  const CLUB_STYLE = {
    '맨체스터 시티': ['tiki', '4-3-3'], '아스널': ['vtiki', '4-3-3', { approach: 3 }], '리버풀': ['vtiki', '4-2-3-1'], '첼시': ['tiki', '4-2-3-1'],
    '맨체스터 유나이티드': ['balance', '3-4-3', { approach: 3 }], '토트넘 홋스퍼': ['direct', '4-2-3-1'], '뉴캐슬 유나이티드': ['gegen', '4-3-3'],
    '브라이턴 & 호브 앨비언': ['tiki', '4-2-3-1'], '브렌트퍼드': ['direct', '4-3-3'], '애스턴 빌라': ['balance', '4-2-3-1', { line: 2 }],
    '본머스': ['gegen', '4-2-3-1'], '크리스털 팰리스': ['counter', '3-4-3'], '노팅엄 포리스트': ['counter', '4-2-3-1'], '에버턴': ['direct', '4-2-3-1'],
    '풀럼': ['balance', '4-2-3-1'], '리즈 유나이티드': ['gegen', '4-3-3'], '선덜랜드': ['counter', '4-2-3-1'],
    '바르셀로나': ['gegen', '4-2-3-1', { passing: 1, line: 2 }], '레알 마드리드': ['balance', '4-3-3', { dribble: 2 }], '아틀레티코 마드리드': ['counter', '4-4-2', { tackle: 2 }],
    '아틀레틱 빌바오': ['gegen', '4-2-3-1'], '레알 소시에다드': ['tiki', '4-3-3'], '레알 베티스': ['tiki', '4-2-3-1'], '비야레알': ['balance', '4-4-2'],
    '셀타 비고': ['tiki', '3-4-3'], '세비야': ['balance', '4-2-3-1'], '헤타페': ['direct', '4-4-2', { tackle: 2, block: 0 }], '라요 바예카노': ['gegen', '4-3-3'],
    '오사수나': ['direct', '4-4-2'], '발렌시아': ['counter', '4-4-2'], '에스파뇰': ['counter', '4-4-2'],
    '바이에른 뮌헨': ['gegen', '4-2-3-1', { mentality: 4 }], '바이어 레버쿠젠': ['tiki', '3-4-3'], '도르트문트': ['balance', '3-4-3'], '라이프치히': ['gegen', '4-4-2', { onWin: 2 }],
    '슈투트가르트': ['vtiki', '4-2-3-1'], '프랑크푸르트': ['vtiki', '4-2-3-1'], '프라이부르크': ['balance', '4-2-3-1'], '우니온 베를린': ['bus', '5-3-2', { passing: 4 }],
    '호펜하임': ['gegen', '4-2-3-1'], '마인츠': ['gegen', '3-4-3'], '묀헨글라트바흐': ['balance', '4-2-3-1'],
    '인테르': ['balance', '3-5-2', { approach: 3 }], '나폴리': ['balance', '4-3-3'], '유벤투스': ['balance', '3-4-3'], 'AC 밀란': ['counter', '3-5-2'],
    '아탈란타': ['gegen', '3-4-3', { marking: 1 }], 'AS 로마': ['gegen', '3-4-3', { marking: 1 }], '라치오': ['tiki', '4-3-3'], '코모': ['tiki', '4-2-3-1'],
    '볼로냐': ['gegen', '4-2-3-1'], '피오렌티나': ['balance', '3-5-2'], '토리노': ['direct', '3-5-2'],
    '파리 생제르맹': ['gegen', '4-3-3', { passing: 1 }], '마르세유': ['tiki', '4-2-3-1'], 'AS 모나코': ['gegen', '4-2-3-1'], '릴': ['tiki', '4-2-3-1'],
    '랑스': ['gegen', '3-4-3'], '올랭피크 리옹': ['balance', '4-2-3-1'], '니스': ['balance', '3-4-3'], '스트라스부르': ['vtiki', '4-2-3-1'], '스타드 렌': ['balance', '3-5-2'],
    '전북 현대 모터스': ['gegen', '4-3-3'], '울산 HD': ['balance', '4-2-3-1'], '포항 스틸러스': ['counter', '4-2-3-1'], '서울': ['tiki', '4-4-2'], '강원': ['gegen', '4-4-2'],
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
    if (t.formationOP == null || (t.formationOP && !FORMATIONS[t.formationOP])) t.formationOP = '';
    return t;
  }

  KM.DATA = { CLUB_STYLE, RIVALS, ROLE_AB, DUTY, ROLES, DEFAULT_ROLE, rolesFor, validRole, roleMods, shapeMap, TACTIC_GROUPS, TACTIC_DEFAULT, TACTIC_PRESETS, normTactics, SURNAMES, GIVEN_A, GIVEN_B, FORMATIONS, ROLE_FIT, POS_KO, TACTIC_LABELS, ROLE_KO, ROLE_NAME, ROLE_GROUP, fit, LEAGUE_ECON, CLUB_KO };
})(globalThis.KM || (globalThis.KM = {}));
