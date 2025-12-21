import { e as createComponent, f as createAstro, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../../chunks/astro/server_QXGJpzTU.mjs';
import 'piccolore';
import { $ as $$Layout } from '../../chunks/Layout_C6hRZAqY.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro();
const prerender = false;
const $$id = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$id;
  const { id } = Astro2.params;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": `Board ${id}` }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<main> ${renderComponent($$result2, "Board", null, { "roomId": id || "default", "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/Board", "client:component-export": "Board" })} </main> ` })}`;
}, "D:/Web/realim/src/pages/board/[id].astro", void 0);

const $$file = "D:/Web/realim/src/pages/board/[id].astro";
const $$url = "/board/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$id,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
