# 엔진 개발 브리핑

AI Core Engine을 만드는 과정을 GitHub Pages로 보여주는 **독립 프로젝트**입니다. 엔진 폴더는 읽기만 합니다. Node.js 22 이상과 Git, GitHub CLI를 사용하며 npm 패키지 설치나 AI API 호출은 필요하지 않습니다.

페이지: https://seungjaehh.github.io/ai-engine-briefing/

## 반영되는 내용

- 현재 개발 단계, 7개 구현 단계의 상태와 완료 근거
- 조사·설계 문서 수, 구현·검증 코드 파일 수, 엔진 Git 커밋 수
- 자료 변경 기록, 공개용 작업 요약, 다음 작업과 차단 사유
- 마지막 수집 시각과 수집 지연 알림
- 등록한 코드 저장소의 브랜치, 로컬 변경 파일 수, 원격과의 커밋 차이

파일 수로 완성도를 계산하지 않습니다. 완료에는 작업자가 등록한 근거가 필요합니다. 수집기는 엔진의 테스트를 실행하거나 결과를 추정하지 않습니다. 첫 화면의 설계 방향은 통합 아키텍처 문서의 **제안**이며 사용자 승인 여부를 뜻하지 않습니다.

## 구조

```text
엔진 폴더 ── 읽기 전용 수집 ── 공개용 JSON ── 별도 GitHub 저장소 ── GitHub Pages
                            ↑
                   단계별 상태와 공개 작업 요약
```

`content/progress.json`은 공개용 작업 기록입니다. `docs/`만 웹사이트로 배포합니다. 원문, 로컬 절대 경로, 설정, 수집 지문, 실행 로그는 게시하지 않습니다. 엔진 커밋 메시지도 수집하지 않습니다. 이미 알고 있는 문서는 고정된 공개 제목으로 표시하고 새 문서는 개수로 집계합니다.

## 로컬 설정

1. `.local/config.json`에 `config.example.json`을 복사합니다.
2. `sourcePath`에 엔진 폴더를, `repository`에 이 브리핑 저장소를 지정합니다.
3. `gh auth login`과 Git 인증을 설정합니다. 비밀번호나 토큰을 파일에 넣지 않습니다.
4. 다음 명령을 사용합니다.

```powershell
npm run collect   # 로컬 데이터를 갱신
npm run preview   # http://127.0.0.1:4317
npm test
npm run check
npm run publish   # 수집 → 공개 데이터만 커밋 → push
```

설정 파일은 UTF-8입니다. 엔진 폴더와 브리핑 폴더는 서로 포함 관계일 수 없습니다. 수집 대상은 Markdown과 코드 파일이며 `projects`, `research/scratch`, `.git`, 의존성·빌드·캐시 폴더 및 심볼릭 링크는 제외합니다. 코드 저장소 상태는 별도 `workspaceRepos`로 집계합니다. 큰 파일 또는 수집 실패가 있으면 마지막 정상 브리핑을 보존합니다.

## 엔진 작업 후 브리핑 기록

엔진을 구현하는 사람이나 에이전트가 이 프로젝트에서 다음 명령을 실행하면 됩니다. 설명과 근거는 **공개할 내용만** 작성하세요.

```powershell
node scripts/progress.mjs policy active --note "실행 범위 제한을 구현하고 있습니다."
node scripts/progress.mjs policy done --note "권한 정책의 첫 구현을 마쳤습니다." --evidence "권한 정책 테스트 20/20 통과, 커밋 abc1234"
node scripts/progress.mjs adapters blocked --note "실행 도구의 인증 확인이 필요합니다."
npm run publish
```

위 예시는 사용법이며 실제 엔진 완료 기록이 아닙니다. `done`에는 매번 새로운 `--evidence`가 필수입니다. `pending`, `active`, `done`, `blocked`를 지원합니다. ID는 `policy`, `ledger`, `adapters`, `gate`, `loop`, `contract`, `validation`입니다. 페이지는 등록된 근거를 표시하며 그 주장의 진위를 자동 보증하지 않습니다. 코드나 문서가 바뀌면 다음 수집에 자동 반영되지만, 의미 있는 작업 설명은 이 명령으로 기록합니다.

## 코드 작업 폴더 상태

`.local/config.json`의 `workspaceRepos`에 저장소마다 공개해도 되는 짧은 이름과 로컬 경로를 등록하면, 브리핑에 브랜치와 변경 파일 수, 원격보다 앞서거나 뒤진 커밋 수가 표시됩니다. 공개 데이터에는 저장소 경로, 변경 파일명, diff, 커밋 메시지를 넣지 않습니다. 같은 폴더를 여러 AI 도구가 함께 수정하면 Git은 도구별 작성자를 구분하지 않으므로, 도구별 현황을 나누려면 각 도구가 별도 Git worktree에서 작업하도록 설정해야 합니다.

```json
"workspaceRepos": [
  { "id": "project-engine", "label": "Project Engine", "path": "../project/source" },
  { "id": "project-site", "label": "Project Website", "path": "../project/site" }
]
```

수집은 기존 PC 작업 스케줄러를 통해 30분마다 실행됩니다. 정확한 파일명과 diff는 로컬 Git 도구나 저장소별 상태판에서 확인하세요.

## 자동 게시

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-task.ps1
Get-ScheduledTaskInfo -TaskName 'AI Engine Briefing'
# 중지 / 재개
Disable-ScheduledTask -TaskName 'AI Engine Briefing'
Enable-ScheduledTask -TaskName 'AI Engine Briefing'
# 제거
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/uninstall-task.ps1
```

Windows 작업 스케줄러에서 현재 사용자가 로그인한 동안 30분마다 확인하고, 로그인 시에도 실행합니다. PC가 꺼져 있거나 인터넷이 끊겨 있으면 게시할 수 없습니다. 변경이 있으면 즉시 커밋·게시하고, 변경이 없어도 6시간마다 수집 시각을 갱신합니다. 공개 페이지는 마지막 수집이 8시간 이상 지연되면 안내를 표시합니다. 브라우저는 5분마다 게시된 자료를 다시 읽습니다.

자동 게시가 커밋하는 파일은 `docs/data/briefing.json`, `content/progress.json` 두 개뿐입니다. 다른 파일이 stage돼 있으면 멈춥니다. 소스·설정 변경은 직접 검토하고 커밋해야 합니다. 네트워크 실패는 다음 실행에 재시도하며, 원격과 갈라진 이력은 강제 덮어쓰지 않습니다. 오류와 마지막 성공은 `.local/publish.log`, `.local/last-run.json`에서 확인합니다.

## GitHub Pages 배포

저장소 **Settings → Pages → Source: GitHub Actions**를 사용합니다. main에 push되면 테스트와 공개 데이터 검사를 통과한 `docs/`만 배포합니다. GitHub Actions는 로컬 PC를 읽을 수 없으므로 자료 수집은 PC에서, 배포는 GitHub에서 수행합니다.

워크플로는 [GitHub 공식 Pages 배포 지침](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)을 따릅니다.

## 개발 원칙

- 엔진 폴더에 쓰거나 엔진을 실행하지 않습니다.
- 브리핑 제작 자체를 엔진 구현 진척으로 계산하지 않습니다.
- 근거 없는 완료, 추정 테스트 통과, 가상의 활동 기록을 만들지 않습니다.
- 공개 브리핑에 원문·자격 증명·개인 경로를 복사하지 않습니다.
- 일반적인 자격 증명 문자열 검사는 보조 장치입니다. 수동으로 작성한 공개 설명은 작성자가 검토해야 합니다.
