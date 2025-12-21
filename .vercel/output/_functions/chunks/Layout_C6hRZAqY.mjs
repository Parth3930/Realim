import { e as createComponent, f as createAstro, h as addAttribute, n as renderHead, o as renderSlot, r as renderTemplate } from './astro/server_QXGJpzTU.mjs';
import 'piccolore';
import 'clsx';
/* empty css                        */

const $$Astro = createAstro();
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Layout;
  const { title } = Astro2.props;
  return renderTemplate`<html lang="en" class="dark"> <head><meta charset="UTF-8"><meta name="description" content="Serverless P2P Real-time Board"><meta name="viewport" content="width=device-width"><link rel="icon" type="image/svg+xml" href="/logo.svg"><meta name="generator"${addAttribute(Astro2.generator, "content")}><title>${title}</title>${renderHead()}</head> <body> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "D:/Web/realim/src/layouts/Layout.astro", void 0);

export { $$Layout as $ };
