//  @ts-check

/** @type {import('prettier').Config} */
const config = {
  semi: false, // no semicolons
  singleQuote: true, // single quotes
  trailingComma: 'none', // cleaner diffs but more minimal look
  bracketSpacing: true, // { foo } instead of {foo}
  arrowParens: 'avoid', // x => x instead of (x) => x
  printWidth: 90, // slightly wider lines = less wrapping
  tabWidth: 2, // standard minimal indentation
  useTabs: false,
  jsxSingleQuote: true, // single quotes in JSX attributes
  endOfLine: 'lf' // consistent LF line endings
}

export default config
