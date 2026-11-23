# CLI 업데이트

MoYEO 소스나 방 설정 변경 없이 설치된 CLI 업데이트.

```cmd
moyeo update codex
moyeo update claude
moyeo update agy
moyeo update all
```

- 대상 생략 시 사용법 안내. `all`은 Codex → Claude → AGY 순서 실행.
- Codex: npm의 `@openai/codex@latest` 설치 방식 사용.
- Claude·AGY: 각 CLI의 `update` 명령 사용. 설치 방식·배포 채널에 따른 실제 업데이트 처리는 해당 CLI에 위임.
- 업데이트 전후 버전 표시. 변경 없는 경우 버전 변경 없음 표시. 명령 실패·업데이트 후 버전 확인 실패 시 실패 표시 및 비정상 종료 코드 반환.
- 전체 실행 중 일부 실패 시 나머지 CLI 계속 진행 후 실패 목록 안내.
- 지정 데이터 폴더의 MoYEO에 진행·대기 작업이 있으면 실행 거부. 자동 예약 없음. 작업 완료 후 재실행 필요.
- 대기 중인 MoYEO는 종료 후 업데이트, 완료·실패 후 동일 데이터 폴더·포트로 재시작. 처음부터 서버가 꺼져 있으면 종료 상태 유지.
- 별도 저장 폴더 사용 시 `moyeo update all --root "C:\path\to\data"` 지정.
- 작업 보호 범위는 지정 데이터 폴더의 MoYEO 서버. 다른 터미널·다른 데이터 폴더에서 실행 중인 CLI는 사용자가 종료한 뒤 실행 필요.
- Claude·AGY 명령이 없는 환경은 먼저 `setupMoyeo.cmd` 실행 필요. 로그인·방·대화 삭제 없음.

## 검증

```cmd
node --test test/update-clis.mjs test/install-provider-clis.mjs test/service-control.mjs
```

설치 명령은 대역으로 검증하여 테스트 중 실제 CLI 설치·업데이트 미실행.