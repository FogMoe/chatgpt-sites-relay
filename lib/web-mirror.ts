import {
  parse,
  serialize,
  type DefaultTreeAdapterTypes,
} from "parse5";
import postcss from "postcss";
import valueParser from "postcss-value-parser";

import {
  hasOnlyAllowedQueryKeys,
  isAllowedPathPrefix,
} from "@/lib/proxy-config";

const WEB_ROUTE = "/web";
const REMOVED_ELEMENTS = new Set([
  "applet",
  "audio",
  "base",
  "button",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "math",
  "object",
  "option",
  "portal",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "template",
  "textarea",
  "track",
  "video",
]);
const REMOVED_ATTRIBUTES = new Set([
  "action",
  "crossorigin",
  "download",
  "form",
  "formaction",
  "formenctype",
  "formmethod",
  "formnovalidate",
  "formtarget",
  "integrity",
  "method",
  "ping",
  "srcdoc",
  "style",
  "target",
]);
const ALLOWED_LINK_RELATIONS = new Set([
  "icon",
  "shortcut",
  "stylesheet",
]);
const GLOBAL_ATTRIBUTES = new Set([
  "class",
  "dir",
  "hidden",
  "id",
  "lang",
  "role",
  "title",
]);
const ELEMENT_ATTRIBUTES = new Map<string, ReadonlySet<string>>([
  ["a", new Set(["href"])],
  ["details", new Set(["open"])],
  ["dialog", new Set(["open"])],
  ["img", new Set(["alt", "decoding", "height", "loading", "src", "width"])],
  ["li", new Set(["value"])],
  ["link", new Set(["href", "media", "rel", "sizes", "type"])],
  ["meter", new Set(["high", "low", "max", "min", "optimum", "value"])],
  ["ol", new Set(["reversed", "start", "type"])],
  ["progress", new Set(["max", "value"])],
  ["td", new Set(["colspan", "headers", "rowspan"])],
  ["th", new Set(["abbr", "colspan", "headers", "rowspan", "scope"])],
  ["time", new Set(["datetime"])],
]);

type MirrorPolicy = {
  allowedPathPrefixes: readonly string[];
  allowedQueryKeys: readonly string[];
  upstreamOrigin: string;
};

type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type CssValueNode = ReturnType<typeof valueParser>["nodes"][number];
type CssFunctionNode = Extract<CssValueNode, { type: "function" }>;

export function sanitizeMirroredHtml(
  html: string,
  upstreamDocumentUrl: URL,
  policy: MirrorPolicy,
): string {
  const document = parse(html);
  sanitizeChildren(document, upstreamDocumentUrl, policy);
  return serialize(document);
}

export function rewriteMirroredCss(
  css: string,
  upstreamStylesheetUrl: URL,
  policy: MirrorPolicy,
): string {
  // CSS escapes can disguise fetch-capable tokens (for example u\72l or
  // @im\70ort). Reject the stylesheet instead of trying to partially decode
  // identifiers and strings with browser-equivalent semantics.
  if (css.includes("\\")) {
    throw new Error("CSS escapes are not supported by the static mirror.");
  }

  const root = postcss.parse(css, { from: undefined });

  root.walkComments((comment) => {
    if (/^[#@]\s*sourceMappingURL=/i.test(comment.text.trim())) {
      comment.remove();
    }
  });

  root.walkAtRules((rule) => {
    if (rule.name.toLowerCase() !== "import") return;

    const parsed = valueParser(rule.params);
    const target = parsed.nodes.find((node) => node.type !== "space");
    if (!target) {
      rule.remove();
      return;
    }

    let rawUrl: string | null = null;
    if (target.type === "string") {
      rawUrl = target.value;
    } else if (
      target.type === "function" &&
      target.value.toLowerCase() === "url"
    ) {
      rawUrl = readCssUrlFunction(target);
    }

    const rewritten = rawUrl
      ? rewriteWebMirrorUrl(rawUrl, upstreamStylesheetUrl, policy)
      : null;
    if (!rewritten) {
      rule.remove();
      return;
    }

    if (target.type === "string") {
      target.value = rewritten;
      target.quote = '"';
    } else if (target.type === "function") {
      replaceCssUrlFunction(target, rewritten);
    }
    rule.params = valueParser.stringify(parsed.nodes);
  });

  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    if (property === "behavior" || property === "-moz-binding") {
      declaration.remove();
      return;
    }

    const parsed = valueParser(declaration.value);
    let blocked = false;
    parsed.walk((node) => {
      if (node.type !== "function") {
        return;
      }

      const functionName = node.value.toLowerCase();
      if (
        functionName === "src" ||
        functionName === "image" ||
        functionName === "image-set" ||
        functionName === "-webkit-image-set"
      ) {
        blocked = true;
        return false;
      }
      if (functionName !== "url") return;

      const rawUrl = readCssUrlFunction(node);
      const rewritten = rawUrl
        ? rewriteWebMirrorUrl(rawUrl, upstreamStylesheetUrl, policy)
        : null;
      if (!rewritten) {
        blocked = true;
        return false;
      }
      replaceCssUrlFunction(node, rewritten);
      return undefined;
    });

    if (blocked) declaration.remove();
    else declaration.value = valueParser.stringify(parsed.nodes);
  });

  return root.toString();
}

export function rewriteWebMirrorUrl(
  value: string,
  upstreamBaseUrl: URL,
  policy: MirrorPolicy,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return trimmed;

  let target: URL;
  try {
    target = new URL(trimmed, upstreamBaseUrl);
  } catch {
    return null;
  }

  if (
    target.protocol !== "https:" ||
    target.origin !== policy.upstreamOrigin ||
    target.username ||
    target.password
  ) {
    return null;
  }

  const decodedPath = decodeSafePath(target.pathname);
  if (
    !decodedPath ||
    !isAllowedPathPrefix(decodedPath, policy.allowedPathPrefixes) ||
    !hasOnlyAllowedQueryKeys(
      target.searchParams,
      policy.allowedQueryKeys,
    )
  ) {
    return null;
  }

  const query = target.searchParams.toString();
  return `${WEB_ROUTE}${target.pathname}${query ? `?${query}` : ""}${target.hash}`;
}

export function decodeSafePath(pathname: string): string | null {
  if (
    pathname.length > 2_048 ||
    pathname.includes("\\") ||
    pathname.includes("//") ||
    /%(?:25|2f|5c|00)/i.test(pathname)
  ) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const segments = decodedPath.split("/").slice(1);
  if (
    !decodedPath.startsWith("/") ||
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || segment.length > 255,
    )
  ) {
    return null;
  }
  return decodedPath;
}

function sanitizeChildren(
  parent: ParentNode,
  upstreamDocumentUrl: URL,
  policy: MirrorPolicy,
): void {
  const retained: typeof parent.childNodes = [];

  for (const child of parent.childNodes) {
    if ("tagName" in child) {
      if (!sanitizeElement(child, upstreamDocumentUrl, policy)) continue;
      sanitizeChildren(child, upstreamDocumentUrl, policy);
    }
    retained.push(child);
  }
  parent.childNodes = retained;
}

function sanitizeElement(
  element: Element,
  upstreamDocumentUrl: URL,
  policy: MirrorPolicy,
): boolean {
  const tagName = element.tagName.toLowerCase();
  if (REMOVED_ELEMENTS.has(tagName)) return false;

  if (tagName === "meta") {
    const charset = getAttribute(element, "charset");
    const name = getAttribute(element, "name")?.toLowerCase();
    if (charset) {
      element.attrs = [{ name: "charset", value: "utf-8" }];
      return true;
    }
    if (name === "viewport") {
      const content = getAttribute(element, "content");
      element.attrs = [
        { name: "name", value: "viewport" },
        ...(content ? [{ name: "content", value: content }] : []),
      ];
      return true;
    }
    return false;
  }

  element.attrs = element.attrs.filter((attribute) => {
    const name = attribute.name.toLowerCase();
    return (
      isAllowedAttribute(tagName, name) &&
      !name.startsWith("on") &&
      !REMOVED_ATTRIBUTES.has(name) &&
      name !== "srcset" &&
      name !== "xlink:href"
    );
  });

  if (tagName === "link") {
    const relations = (getAttribute(element, "rel") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (
      relations.length === 0 ||
      relations.some((relation) => !ALLOWED_LINK_RELATIONS.has(relation))
    ) {
      return false;
    }
    rewriteAttribute(
      element,
      "href",
      upstreamDocumentUrl,
      policy,
    );
  } else if (tagName === "a") {
    rewriteAttribute(
      element,
      "href",
      upstreamDocumentUrl,
      policy,
    );
    setAttribute(element, "rel", "nofollow noopener noreferrer");
  } else if (tagName === "img") {
    rewriteAttribute(
      element,
      "src",
      upstreamDocumentUrl,
      policy,
    );
  } else {
    removeAttribute(element, "href");
    removeAttribute(element, "src");
  }

  return true;
}

function isAllowedAttribute(tagName: string, name: string): boolean {
  return (
    GLOBAL_ATTRIBUTES.has(name) ||
    /^aria-[a-z0-9_.-]+$/.test(name) ||
    (ELEMENT_ATTRIBUTES.get(tagName)?.has(name) ?? false)
  );
}

function rewriteAttribute(
  element: Element,
  name: string,
  upstreamDocumentUrl: URL,
  policy: MirrorPolicy,
): void {
  const value = getAttribute(element, name);
  if (!value) return;
  const rewritten = rewriteWebMirrorUrl(
    value,
    upstreamDocumentUrl,
    policy,
  );
  if (rewritten) setAttribute(element, name, rewritten);
  else removeAttribute(element, name);
}

function getAttribute(element: Element, name: string): string | null {
  return (
    element.attrs.find(
      (attribute) => attribute.name.toLowerCase() === name,
    )?.value ?? null
  );
}

function setAttribute(
  element: Element,
  name: string,
  value: string,
): void {
  const existing = element.attrs.find(
    (attribute) => attribute.name.toLowerCase() === name,
  );
  if (existing) {
    existing.value = value;
    return;
  }
  element.attrs.push({ name, value });
}

function removeAttribute(element: Element, name: string): void {
  element.attrs = element.attrs.filter(
    (attribute) => attribute.name.toLowerCase() !== name,
  );
}

function readCssUrlFunction(
  node: CssFunctionNode,
): string | null {
  const meaningful = node.nodes.filter(
    (child) => child.type !== "space" && child.type !== "comment",
  );
  if (meaningful.length !== 1) return null;
  const value = meaningful[0];
  return value.type === "string" || value.type === "word"
    ? value.value
    : null;
}

function replaceCssUrlFunction(
  node: CssFunctionNode,
  value: string,
): void {
  node.nodes = [
    {
      type: "string",
      quote: '"',
      value,
      sourceIndex: 0,
      sourceEndIndex: value.length + 2,
    },
  ];
}
