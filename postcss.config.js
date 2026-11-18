import purgecss from '@fullhuman/postcss-purgecss';

/**
 * 只對 NES.css 移除沒用到的規則（整包約 290 KB，實際只用到按鈕、容器、輸入框等少數元件）。
 * 自己寫的主題樣式不處理，因為裡面有用字串組出來的 class（例如 t-s、p-PS），自動判斷容易誤刪。
 */
const purge = purgecss({
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: { standard: ['html', 'body'] },
});

export default {
  plugins: [
    {
      postcssPlugin: 'purge-nes-css-only',
      OnceExit(root, helpers) {
        if (!/[\\/]nes\.css[\\/]/.test(root.source?.input.file || '')) return;
        return purge.OnceExit(root, helpers);
      },
    },
  ],
};
