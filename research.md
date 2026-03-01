# Micro Frontend (MFP) Project Research Report

이 보고서는 현재 프로젝트 디렉토리에 구성된 마이크로 프론트엔드(Micro Frontend, MFE) 리포지토리의 소스 코드 및 아키텍처에 대한 심층적이고 종합적인 분석 결과를 담고 있습니다.

---

## 1. 아키텍처 개요 (Architecture Overview)

이 프로젝트는 **Webpack 5의 Module Federation(이하 모듈 페더레이션)** 플러그인을 사용하여 개발된 마이크로 프론트엔드 환경입니다.
단일 모노레포(Monorepo)와 유사한 형태를 띠며 각각의 독립된 서브 애플리케이션(Sub-applications)이 `packages/` 폴더 하위에 위치해 있습니다. 컨테이너(호스트) 애플리케이션이 런타임에 다른 원격(Remote) 애플리케이션을 불러와 하나로 통합된 웹 애플리케이션처럼 보이도록 합니다.

### 아키텍처의 주요 장점
* **독립적인 배포 (Independent Deployment):** 특정 모듈(예: Marketing)이 변경되어도 전체 시스템을 재빌드하지 않고 해당 모듈만 빌드 및 배포할 수 있습니다.
* **기술 스택의 유연성:** 각 모듈이 완전히 분리되어 작동하므로 컨테이너와 마케팅은 React로, 대시보드는 Vue 3로 구성하는 등 여러 기술 스택을 접목할 수 있도록 설계되었습니다.
* **런타임 통합 (Runtime Integration):** 빌드 타임 의존성이 아닌 런타임에 외부 URL에서 자바스크립트(`remoteEntry.js`)를 가져오기 때문에 캐싱 제어와 롤백, 업데이트 사이클이 독자적으로 동작합니다.

---

## 2. 모듈 구성 및 디렉토리 구조 (Packages Structure)

`packages/` 하위에는 4개의 주요 프로젝트가 구성되어 있습니다.

| 패키지명 (`packages/*`) | 역할 및 설명 | 기술 스택 | 로컬 Dev 포트 |
| :--- | :--- | :--- | :--- |
| **`container`** | **Host Shell** - 다른 MFE들을 런타임에 불러오고 배치하는 껍데기 역할 | React 17 | `8080` |
| **`marketing`** | **Remote Feature** - 랜딩 및 가격 정책 페이지를 렌더링하는 모듈 | React 17 | `8081` |
| **`auth`** | **Remote Feature** - 향후 로그인 및 인증이 구현될 초기 스캐폴딩 뼈대 | React 17 | - |
| **`dashboard`** | **Remote Feature** - 향후 대시보드가 구성될 초기 스캐폴딩 뼈대 | Vue 3 + PrimeVue | - |

---

## 3. Webpack 모듈 페더레이션 세부 (Webpack Module Federation)

컨테이너와 리모트 앱들 간의 통신은 Webpack 설정의 `ModuleFederationPlugin`을 통해 정교하게 관리됩니다.
각 프로젝트에는 개발 환경(`webpack.dev.js`)과 운영 환경(`webpack.prod.js`) 설정이 분리되어 있습니다.

### 리모트 앱 설정 (예: `marketing`)
* **플러그인 옵션:** `filename`을 `remoteEntry.js`로 지정하여 진입 스크립트를 생성합니다.
* **Exposes (모듈 노출):** `'./MarketingApp'` 이름으로 `'./src/bootstrap'` 경로를 외부로 노출합니다. 즉 호스트에서는 외부 컴포넌트 전체가 아닌 진입을 허용하는 마운트 함수를 가져오도록 설계되었습니다.
* **Shared Dependencies:** 리엑트 같은 주요 라이브러리의 중복 다운로드를 막기 위해 `package.json`의 `dependencies`를 `shared`로 넘깁니다.

### 컨테이너 브로커 설정 (`container`)
* **Remotes 지정:** 
  * 개발 환경: `marketing: 'marketing@http://localhost:8081/remoteEntry.js'`로 설정되어 로컬 환경을 실시간 참조합니다.
  * 배포 환경: 환경변수(`PRODUCTION_DOMAIN`)를 사용하여 `marketing: 'marketing@https://${domain}/marketing/latest/remoteEntry.js'` 형태로 프로덕션 S3/CloudFront의 파일을 가리킵니다.
* **Cache Busting 전략:** 운영 빌드에서는 `[name].[contenthash].js` 형식으로 파일명을 생성하여 캐싱 문제를 해결합니다.

---

## 4. 라우팅 (Routing) 및 동기화 (Synchronization) 전략

이 프로젝트의 핵심 난제 중 하나인 '마이크로 프론트엔드 라우팅 동기화'는 매우 정교하게 해결되었습니다.

### 브라우저 히스토리 (Browser History) 충돌 방지 전략
두 개 이상의 독립적인 React 애플리케이션이 동시에 ブラウザ의 URL(`BrowserHistory`)을 조작하려고 할 때 무한 루프나 충돌 혹은 뒤로가기 오작동이 발생합니다.
* **컨테이너 (Host):** 전체 URL을 관장하는 주체로 `BrowserHistory` (`react-router-dom`의 `<BrowserRouter>`)를 사용합니다.
* **마케팅 (Remote):** 컨테이너에 의해 통합될 때는 메모리에만 URL을 저장하는 **`MemoryHistory`**를 사용하여 URL이 직접 변경되는 것을 막습니다. 
* *단, 개발 환경(`NODE_ENV === 'development'`)에서 독자적으로 `8081` 포트에서 실행될 때는 테스트를 위해 예외적으로 `BrowserHistory`를 생성하여 마운트합니다.*

### 양방향 라우팅 동기화 (Bi-directional Navigation Sync)
1. **자식에서 부모로 (Remote ➜ Container):** `bootstrap.js`의 `mount` 함수는 두 번째 인자로 `onNavigate` 콜백을 받습니다. 마케팅 앱 내부에서 페이지 이동이 일어나면 이 콜백을 통해 컨테이너에게 "내 라우팅 경로가 `${nextPathname}`으로 변경되었다"고 알려주고, 컨테이너는 이를 통해 자신의 `BrowserHistory.push()`를 호출하여 실제 브라우저 URL을 변경합니다.
2. **부모에서 자식으로 (Container ➜ Remote):** `mount` 함수 호출 후 반환값으로 리모트 컨트롤 객체 (e.g. `onParentNavigate` 메서드)를 되돌려 줍니다. 컨테이너 영역(예: `Header` 컴포넌트의 로고 클릭)에서 라우팅이 일어나면 반환된 `onParentNavigate`를 호출하여 리모트 앱 측의 `MemoryHistory.push()`를 강제로 동기화시켜 리모트 컴포넌트의 UI를 업데이트합니다.

---

## 5. CSS 스코프(Scope) 충돌 방지 전략

여러 React 애플리케이션이 Material-UI (MUI)를 사용할 경우, 서로 다른 독립된 앱이 동일한 CSS 클래스명 (예: `.jss1`, `.jss2`)을 생성하게 되어 스타일 오버라이드 및 충돌이 발생할 수 있습니다.
* **`createGenerateClassName()` 활용:** `container`, `marketing` 양측에서 각각 독자적인 프로덕션 Prefix를 지정합니다.
  * Container: `productionPrefix: 'co'` (`.co1`, `.co2` 등)
  * Marketing: `productionPrefix: 'ma'` (`.ma1`, `.ma2` 등)
* 이를 통해 마이크로 프론트엔드 환경에서 발생할 수 있는 CSS Bleeding (스타일 침범) 현상을 완벽하게 예방하고 있습니다.

---

## 6. 빌드, 배포 및 CI/CD 아키텍처 (AWS & GitHub Actions)

빌드 및 배포 자동화 파이프라인은 `.github/workflows/` 내에 명시되어 있으며, 각 MFE 프로젝트마다 완전히 파편화/독립된 CI/CD 워크플로우를 소유합니다.

### CI/CD Workflow (`container.yml`, `marketing.yml`)
1. **Trigger 조건:** `main` 브랜치에 푸시가 발생하되, 각 패키지 영역(예: `paths: ['packages/container/**']`)이 변경되었을 때만 개별 트리거됩니다.
2. **빌드:** `PRODUCTION_DOMAIN`과 같은 시크릿 환경 변수를 주입받아 Webpack 빌드(`npm run build`)를 실행합니다.
3. **AWS S3 배포:** `aws s3 sync dist s3://{BUCKET_NAME}/[모듈명]/latest` 명령을 통해 빌드 결과물을 `latest` 폴더 하위에 직접 업로드합니다.
4. **AWS CloudFront Cache Invalidation:** 새 버전 배포 즉시 CloudFront 엣지 캐시를 강제로 파기(Invalidation)하여 전 세계 유저들이 최신 버전(`index.html` 혹은 `remoteEntry.js`)을 즉시 내려받도록 합니다.

### SPA 라우팅 문제 해결을 위한 CloudFront Function 전략
S3와 CloudFront를 이용해 SPA(Single Page Application)를 정적 호스팅 할 때 발생하는 가장 큰 문제는 사용자가 `/pricing`과 같이 파일 확장자가 없는 서브 경로로 바로 진입 및 새로고침 할 경우 S3가 디렉토리로 오해하여 403 / 404 오류를 내뱉는 증상입니다.
* `packages/container/cloudfront-spa-function.js` :
   AWS CloudFront Function 레벨에서 들어오는 `Event Viewer Request`를 가로챕니다.
   요청된 URI가 `.` (확장자)를 포함하지 않는다면 무조건 `/container/latest/index.html`로 URL 포워딩(Rewrite)하여 컨테이너의 React-router-dom이 요청을 낚아채어 정상적인 SPA 페이지를 렌더링 할 수 있도록 매우 우아하게 처리되어 있습니다.
* **동적 AWS 구성 주입:** `container.yml` 하단부에는 해당 CloudFront 함수를 배포하고, 파이썬(Python) 내장 스크립트를 활용해 CloudFront Distribution의 설정(JSON)을 가로채어 Viewer-Request 이벤트에 해당 SPA 라우팅 함수를 자동으로 업데이트하고 묶어주는 데브옵스 수준의 자동 구성 스크립트가 구현되어 있습니다.

---

## 종합 결론
본 프로젝트는 현대적인 웹 개발 트렌드인 마이크로 프론트엔드 개념을 Webpack Module Federation이라는 최적의 도구를 이용하여 구축한 교과서적인 모범 사례입니다. 라우터 히스토리 충돌(MemoryHistory & BrowserHistory 동기화)과 CSS 클래스 충돌 방지 전략은 물론, 개별 CI/CD 배포 파이프라인과 CloudFront 엣지 라우팅 해결까지 엔터프라이즈 레벨의 배포/운영 요구 사항을 매우 정교하게 해결하고 있습니다.
