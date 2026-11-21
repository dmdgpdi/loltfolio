# 프론트엔드 지침

## 기술 스택

React, `@tailwindcss/turbopack`을 통한 Tailwind CSS, TanStack Query와 React Query Devtools를 사용한다.

## 아키텍처

가벼운 Model–ViewModel–View 구조를 따른다.

- **Model**: 비즈니스 로직·규칙·데이터 구조를 담당한다. 반드시 단위 테스트한다.
- **ViewModel**: View에 타입이 명시된 인터페이스를 제공하고 Model 데이터를 변환하며 화면 상태와 동작을 관리한다. 반드시 테스트한다.
- **View (컴포넌트)**: UI를 렌더링하고 ViewModel을 통해 사용자 상호작용을 처리한다. 비즈니스 로직을 View에 넣지 않는다.

의존 방향은 `View → ViewModel → Model`이다.

프론트엔드 MVVM은 책임을 구분하는 기준이며 특정 폴더 구조를 강제하지 않는다.

Model과 ViewModel의 단위 테스트에는 Vitest를 사용한다. 프론트엔드 구현은 이 디렉터리에 두고, `src/app`은 Next.js 라우팅 진입점을 제공한다. 클라이언트 컴포넌트에서 서버 전용 백엔드 코드를 가져오지 않는다.
