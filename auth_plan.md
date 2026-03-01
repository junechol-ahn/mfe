# Auth 앱 - 로그인(Signin) 구현 계획서

## 1. 목표 (Goal Description)

이메일/비밀번호 기반의 접근 방식을 사용하여 `auth` 마이크로 프론트엔드 내에 `Signin`(로그인) 기능을 구현합니다. 또한 인증된(로그인된) 상태가 전체 마이크로 프론트엔드 아키텍처(특히 `container` 및 향후 추가될 `dashboard`)에 걸쳐 올바르게 공유되도록 보장합니다.

**설계 방향 및 제약사항:**
*   **MFE 통합 로직 집중:** 마이크로 프론트엔드 모듈 간의 상태 연결 로직에만 100% 집중하기 위해, 외부 인증 라이브러리(Firebase 등)를 사용하지 않고 완전한 **Mock 데이터** 기반으로 동작하도록 개발합니다.
*   **가상 로그인 처리:** 회원가입(Signup) 페이지 및 로직은 일절 구현하지 않습니다. 로그인(Signin) 기능의 경우 비밀번호 입력란을 제공하지만 검증 절차는 통과(Bypass)하며, 제출 버튼을 누르면 언제나 **고정된 사용자(Mock User)**로 무조건 성공 처리되도록 작성합니다.

## 2. 마이크로 프론트엔드 상태 공유 전략 (Microfrontend State Sharing Strategy)

Module Federation 아키텍처에서 `container`(Host)와 `auth`(Remote) 간에 "사용자가 로그인했는가?"와 같은 상태를 공유할 때, 강도 높은 결합(Tight coupling)을 피해야만 합니다.

**전략: `mount` 함수를 통한 콜백(Callback) 전달**
1. `container`가 최상위 상태를 보유합니다. (예: `const [isSignedIn, setIsSignedIn] = useState(false)`)
2. `container`는 `AuthApp`을 마운트할 때 콜백 함수인 `onSignIn`을 하위로 전달합니다.
3. 사용자가 `auth` MFE 내부에서 로그인 폼을 제출(무조건 성공)하면, `auth` MFE는 전달받은 `onSignIn` 콜백을 호출합니다.
4. `container`는 자신의 상태(`isSignedIn`)를 `true`로 업데이트하고, 이 상태를 바탕으로 Header의 "Login" 버튼을 "Logout"으로 변경하며, 자동 라우팅(홈이나 대시보드로 이동)을 제어할 수 있습니다.

## 3. 제안하는 변경 사항 (Proposed Changes)

### `auth` 패키지 영역

#### [MODIFY] `packages/auth/src/bootstrap.js`
- `mount` 함수의 매개변수(Signature)를 업데이트하여 컨테이너로부터 `onSignIn` 콜백을 받을 수 있도록 합니다.
- `onSignIn` 함수를 `<App />` 컴포넌트의 Props로 내려보냅니다.

#### [MODIFY] `packages/auth/src/App.js`
- `onSignIn`을 Props로 전달받습니다.
- `<Signin />` 라우트 컴포넌트에 `onSignIn`을 하위 Props로 전달합니다. (Signup 관련 기존 코드는 모두 제거하거나 무시합니다.)

#### [NEW] `packages/auth/src/components/Signin.js`
- Material-UI 기반의 로그인 폼(이메일/비밀번호 입력란과 제출 버튼)을 생성합니다.
- 제출 버튼 동작(onClick/onSubmit): 이메일이나 비밀번호 검증 없이 즉시 `onSignIn()` 콜백을 실행하여 인증 성공 이벤트를 트리거합니다.

---

### `container` 패키지 영역

#### [MODIFY] `packages/container/src/App.js`
- 상태 선언: `const [isSignedIn, setIsSignedIn] = useState(false);`
- `isSignedIn` 상태와 `setIsSignedIn` 함수를 자식 컴포넌트들에 각각 적절하게 Prop으로 전달합니다.
- `<AuthLazy onSignIn={() => setIsSignedIn(true)} />` 형태로 작성하여 로그인 완료 및 리모트 앱 상호작용 지점을 정의합니다.

#### [MODIFY] `packages/container/src/components/AuthApp.js`
- `mount` 호출 부분을 수정하여, App.js에서 받은 `onSignIn`을 `auth` 모듈의 `bootstrap.js`에 주입(Inject)합니다.

#### [MODIFY] `packages/container/src/components/Header.js`
- `isSignedIn` 속성을 수신합니다.
- `isSignedIn === true`인 경우 "Logout" 버튼을, `false`인 경우 "Login" 버튼을 렌더링합니다.
- "Logout" 버튼 클릭 이벤트 핸들러에는 `setIsSignedIn(false)` 로직을 연결하여 브라우저에서 강제로 로그아웃 상태로 만들 수 있도록 처리합니다.

## 4. 검증 계획 (Verification Plan)

### 수동 검증 (Manual Verification)
1. 브라우저에서 `http://localhost:8080/` (Host 앱)으로 접속합니다.
2. 헤더(Header) 컴포넌트에 "Login" 버튼이 올바르게 나타나는지 확인합니다.
3. "Login" 버튼을 클릭하여 `auth` MFE의 로그인 폼 컴포넌트가 로드되는 위치(`http://localhost:8080/auth/signin`)로 이동합니다.
4. 아무 이메일과 비밀번호나 입력한 뒤 폼 제출(Submit / 로그인) 버튼을 누릅니다.
5. **기대 결과**: 라우팅이 자동으로 홈 페이지 등 다른 경로로 이동하며, 이와 동시에 상단 Header 컴포넌트의 우측 상단 버튼이 "Login"에서 **"Logout"**으로 즉시 변경되어 통신(`onSignIn`)이 모두 성공했음을 시각적으로 입증해야 합니다.
