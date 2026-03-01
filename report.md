# MFP 코드베이스 심층 분석 보고서

작성일: 2026-03-01
대상 경로: `/home/junechol/learn-wsl/react/mfp`
브랜치: `main`

## 1) 요약

이 저장소는 Webpack 5 Module Federation 기반 마이크로 프론트엔드(MFE) 모노레포입니다.

- Host: `packages/container` (React)
- Remote: `packages/marketing` (React), `packages/auth` (React), `packages/dashboard` (Vue 3 + PrimeVue)
- 개발 시 로컬 포트:
  - container: 8080
  - marketing: 8081
  - auth: 8082
  - dashboard: 8083

실제 제품 동선은 현재 `container`가 `marketing` + `auth`만 소비합니다. `dashboard`는 remote 노출까지 구현되어 있으나 container에서 아직 연결되지 않았습니다.

## 2) 디렉토리/파일 구조 핵심

루트 주요 파일:

- `.github/workflows/*.yml`: 패키지별 배포 파이프라인
- `packages/*`: 각 독립 애플리케이션
- `research.md`, `auth_plan.md`: 분석/계획 문서
- `CLAUDE.md`: 에이전트 안내 문서(일부 내용이 현재 코드와 불일치)

패키지별 핵심:

- `packages/container`
  - `src/App.js`: host 라우팅/상태/remote 로딩 중심
  - `src/components/MarketingApp.js`, `AuthApp.js`: remote mount 브릿지
  - `config/webpack.*.js`: remotes 연결 설정
  - `cloudfront-spa-function.js`: SPA 딥링크 처리
- `packages/marketing`
  - `src/bootstrap.js`: mount API + 독립 실행/통합 실행 분기
  - `src/App.js`: `/`, `/pricing` 라우팅
- `packages/auth`
  - `src/bootstrap.js`: mount API + onSignIn 콜백 연결
  - `src/App.js`: `/auth/signin`, `/auth/signup` 라우팅
- `packages/dashboard`
  - `src/bootstrap.js`: Vue 앱 mount API
  - `src/components/Dashboard.vue`: 대시보드 UI(PrimeVue)

## 3) 런타임 동작 상세

### 3.1 엔트리 및 지연 로딩 패턴

모든 앱이 `src/index.js`에서 `import('./bootstrap')` 패턴을 사용합니다.

의도:
- Module Federation과 초기화 순서/공유 의존성 해결에 유리
- bootstrapping 코드를 별도 청크로 분리

### 3.2 Container(host) 동작

`packages/container/src/App.js` 기준:

- Router: `<BrowserRouter>` 사용 (브라우저 URL의 단일 소유자)
- Lazy loading: `MarketingApp`, `AuthApp`를 `React.lazy` + `Suspense`로 로드
- 인증 상태: `isSignedIn`를 host state로 보유
- Header:
  - 로그인 전: `Login` 버튼이 `/auth/signin`
  - 로그인 후: `Logout` 버튼이 `/` + 상태 초기화

라우팅:
- `/auth` 경로: Auth remote 렌더
- `/` 경로: Marketing remote 렌더

### 3.3 Remote mount 계약(Contract)

`marketing`/`auth`는 공통적으로 `mount(el, options)`를 export합니다.

options 주요 필드:
- `initialPath`: host가 넘긴 현재 경로
- `onNavigate`: remote 내부 라우팅 변경 시 host 통지
- `defaultHistory`: 독립 실행 시 BrowserHistory 주입
- `onSignIn`(auth 전용): 로그인 성공 이벤트를 host로 전달

반환값:
- `onParentNavigate({ pathname })`: host 경로 변경을 remote history에 반영

즉, 부모/자식 라우팅이 양방향 동기화됩니다.

### 3.4 History 전략

- Host(container): `BrowserRouter` (실제 URL 변경)
- Remote(통합 시): `createMemoryHistory` (URL 직접 제어 방지)
- Remote(독립 개발 시): `createBrowserHistory`

이 구조는 MFE에서 흔한 무한 push 루프를 방지하기 위해 다음 가드를 둡니다.
- 현재 pathname과 next pathname이 다를 때만 `history.push`

### 3.5 스타일 충돌 방지

Material-UI 클래스명 prefix를 앱별로 분리:
- container: `co`
- marketing: `ma`
- auth: `au`

MFE 간 CSS 충돌 가능성을 실용적으로 줄인 설계입니다.

## 4) Module Federation 설정 분석

### 4.1 Dev 설정

- container remotes:
  - `marketing@http://localhost:8081/remoteEntry.js`
  - `auth@http://localhost:8082/remoteEntry.js`
- marketing/auth/dashboard 각자 `remoteEntry.js`를 expose

### 4.2 Prod 설정

- container는 `PRODUCTION_DOMAIN` 기반으로 remote URL 조합
  - `https://${PRODUCTION_DOMAIN}/marketing/latest/remoteEntry.js`
  - `https://${PRODUCTION_DOMAIN}/auth/latest/remoteEntry.js`
- remote 앱은 각자 `publicPath`를 `/<app>/latest/`로 고정
- 대부분 `[name].[contenthash].js` 사용

### 4.3 공유 의존성(shared)

- prod의 remote/container에서 `shared: packageJson.dependencies` 적용
- dev에서는 shared 미설정(동작은 가능하지만 dev에서 중복 로드 가능성 존재)

## 5) CI/CD 및 운영 배포 구조

워크플로우:
- `auth.yml`, `marketing.yml`, `container.yml`
- 트리거: `main` push + 해당 패키지 경로 변경

공통 배포 흐름:
1. 패키지별 `npm install` / `npm run build`
2. `dist`를 S3 `/<app>/latest`로 sync
3. CloudFront invalidation

container만 추가로 수행:
- CloudFront Function(`mfp-container-spa-routing`) 생성/업데이트/퍼블리시
- Distribution `viewer-request`에 함수 연결
- `CustomErrorResponses` 제거

`cloudfront-spa-function.js` 동작:
- 요청 URI에 확장자가 있으면 그대로 통과
- 확장자가 없으면 `/container/latest/index.html`로 rewrite

결과:
- SPA 딥링크(`/pricing`, `/auth/signin`) 새로고침 시 404/403 회피

## 6) 기능 관점 현재 상태

### 6.1 사용자 플로우

1. `container` 접속 (`/`)
2. Marketing 랜딩/프라이싱 탐색 (`/pricing`)
3. 프라이싱 버튼에서 `/auth/signup` 진입
4. Sign in/up 버튼 클릭 시 `onSignIn` 호출
5. host `isSignedIn=true` 반영 → 헤더 버튼 `Logout` 표시

### 6.2 Dashboard 상태

- dashboard는 dev/prod federation expose 완료
- 그러나 container remotes에 dashboard가 없음
- 따라서 현재 사용자 경로에서는 dashboard가 노출되지 않음

## 7) 코드 품질/리스크/불일치 사항

### 7.1 문서 불일치

`CLAUDE.md`와 실제 코드가 일부 다릅니다.

- 문서: auth/dashboard가 scaffold only, src 없음
- 실제: auth/dashboard 모두 src/webpack/scripts 동작 가능

문서 최신화 필요.

### 7.2 기술 부채/유지보수 이슈

- `webpack-dev-server@3` + `webpack@5` 조합(구버전 dev server)
- React 앱들이 `react-router-dom@5` 기반(신규 프로젝트 기준 구버전)
- dashboard는 `node-sass` 포함(네이티브 빌드 이슈/유지보수 부담 가능)

### 7.3 잠재 버그/개선 포인트

- `auth/src/bootstrap.js`에 `console.log(nextPathname)` 디버그 로그 잔존
- container에서 `history.listen(onParentNavigate)` unlisten 처리 없음
  - 현재는 컴포넌트 생명주기상 큰 문제는 작지만, cleanup 추가가 권장
- `webpack.dev.js`의 `const packageJson = require('../package.json')`가 일부 파일에서 미사용

### 7.4 배포 파이프라인 지역 설정 이질성

워크플로우에서 AWS region이 용도별로 혼재:
- S3 sync: `ap-southeast-2`
- invalidation: `us-east-2`
- CloudFront function/distribution update: `us-east-1`

CloudFront API 특성상 `us-east-1`이 일반적이라 일부는 합리적이지만, 현재 설정 이유를 문서화하지 않으면 운영 혼란 가능.

## 8) 현재 워킹트리 상태(중요)

분석 시점에 아래 파일은 이미 수정 상태였습니다(본 보고서 작성 이전부터 존재):

- `packages/container/public/index.html`
- `packages/dashboard/public/index.html`
- `packages/dashboard/src/components/Dashboard.vue`

즉, 본 보고서는 위 변경을 포함한 “현재 워킹트리 기준” 분석입니다.

## 9) 실행 방법 정리

각 패키지는 독립 실행:

```bash
cd packages/container && npm start   # 8080
cd packages/marketing && npm start   # 8081
cd packages/auth && npm start        # 8082
cd packages/dashboard && npm start   # 8083
```

통합 확인 최소 조건:
- container + marketing + auth 동시 실행
- container 접속 후 `/`, `/pricing`, `/auth/signin`, `/auth/signup` 동선 확인

## 10) 결론

이 코드베이스는 교육용/실험용을 넘어, 실제 운영을 염두에 둔 MFE 핵심 패턴(독립 배포, 라우팅 동기화, 스타일 격리, CloudFront SPA rewrite)을 이미 갖추고 있습니다.

현재 구조의 본질:
- `container`가 URL/전역 상태의 단일 오케스트레이터
- remotes는 `mount contract`를 통해 독립성과 통합성을 동시에 확보

다음 성숙화 단계는 다음 3가지입니다.

1. 문서 최신화(`CLAUDE.md` 등)로 코드-문서 불일치 제거
2. dashboard를 container에 실제 연결해 기능 경로 확장
3. 의존성(react-router v6+, webpack-dev-server v4+) 업그레이드 계획 수립

