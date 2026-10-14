// ESLint 코드 검사 설정
// 이 프로젝트의 js 파일들은 일반 <script>로 불러와 전역 변수·함수를 서로 공유한다.
// ESLint는 파일을 하나씩 검사하므로, 다른 파일에 정의된 이름을 알려줘야 "정의 안 됨" 오류가 나지 않는다.
// → 각 파일의 최상위 선언(const/let/var/function/class)을 자동으로 읽어 "공유 이름 목록"을 만든다.
//   목록에 없는 이름을 쓰면 오류가 나므로, 어느 파일에도 없는 이름을 쓴 실수를 잡을 수 있다.
const fs = require('fs');
const path = require('path');
const js = require('@eslint/js');
const globals = require('globals');

const APP_FILES = [];
(function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(p);
    else if (entry.name.endsWith('.js')) APP_FILES.push(p);
  }
})(path.join(__dirname, 'js'));

// 파일별 최상위 선언 이름 (줄 맨 앞에서 시작하는 선언만)
// - function / class 는 이름 하나
// - const / let / var 는 한 줄에 여러 개일 수 있음 (예: let a = null, b = [];)
const FUNC_DECL = /^(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
const VAR_DECL = /^(?:const|let|var)\s+([^;\n]+)/gm;
const VAR_NAME = /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?==|,|$)/g;
const declaredIn = new Map();
for (const file of APP_FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(FUNC_DECL)) names.add(m[1]);
  for (const m of src.matchAll(VAR_DECL)) for (const v of m[1].matchAll(VAR_NAME)) names.add(v[1]);
  declaredIn.set(file, names);
}
const allAppNames = new Set([...declaredIn.values()].flatMap(s => [...s]));
// 다른 파일이 값을 바꾸는 전역(let)은 writable, 나머지는 readonly
const asGlobals = names => Object.fromEntries([...names].map(n => [n, 'writable']));

const appRules = {
  ...js.configs.recommended.rules,
  'no-undef': 'error',
  // 최상위 이름은 다른 파일에서 쓰이므로 "안 쓰는 변수"는 함수 안의 지역 변수만 검사
  'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
};

module.exports = [
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'blob-report/'] },

  // 앱 코드: 파일마다 "자기 파일에 없는 공유 이름"만 전역으로 알려준다 (자기 선언과 중복 경고 방지)
  ...APP_FILES.map(file => {
    const own = declaredIn.get(file);
    const others = new Set([...allAppNames].filter(n => !own.has(n)));
    return {
      files: [path.relative(__dirname, file).replace(/\\/g, '/')],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script',
        globals: { ...globals.browser, ...asGlobals(others) },
      },
      rules: appRules,
    };
  }),

  // 테스트 코드(Node에서 실행, page.evaluate 안에서는 앱 전역 사용)
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser, ...asGlobals(allAppNames) },
    },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['warn', { args: 'none' }] },
  },

  // 설정 파일들
  {
    files: ['*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: globals.node },
    rules: js.configs.recommended.rules,
  },
];
