# Codex 기록 분리

- 적용 대상: 일반 MoYEO Codex app-server 및 exec 호출
- 저장 위치: MoYEO 데이터 폴더/.codex-runtime
- 분리 대상: 세션·기록·SQLite DB·로그
- 기존 방 재개: 방에 기록된 세션 ID에 해당하는 원본 세션 파일만 전용 폴더로 복사
- 기존 GUI 기록: 자동 삭제·보관 처리 없음
- 개인 전체 세션 및 DB 복사 금지
- 개인 마지막 세션을 암묵적으로 선택하는 --last 사용 차단

## 로그인 및 설정

기존 CODEX_HOME 또는 사용자 .codex의 auth.json·config.toml 등 필요한 파일 동기화. 전용 인증 파일의 갱신 토큰을 이전 원본으로 덮어쓰지 않도록 원본 변경 해시 관리. 원본 로그인 변경·로그아웃 반영. 스킬·플러그인·규칙·메모리 디렉터리 연결 유지.

OS 키체인에만 로그인 정보가 있고 auth.json이 없는 환경의 자동 로그인 공유는 미검증. 이 경우 전용 CODEX_HOME에서 로그인 필요 가능. 전용 폴더에도 인증 파일이 포함되므로 외부 공유용 백업에서 인증 정보 제외 필요.

## 검증 — 2026-11-18

- 실제 app-server 제어 API에서 기존 MoYEO 세션 복사본을 같은 ID로 재개 확인
- 재개 응답 경로 및 신규 thread/start 경로가 전용 폴더 내부임을 확인
- state_5.sqlite 등 DB의 전용 폴더 생성 확인
- 모델 생성 호출 없이 검증, 기존 GUI 세션 삭제 없음
- 분리·선택 이관·자격 증명 갱신·exec 인자·기존 전달 경로 테스트 20개 통과
- 책임님 PC의 기존 GUI 기록 정리 및 화면 확인은 별도 작업

설정 근거: https://learn.chatgpt.com/docs/config-file/environment-variables
