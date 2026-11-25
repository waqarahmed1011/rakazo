import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { indexPageMiddleware } from "./index-page";
import {
  instanceIdentity,
  instanceManifest,
  instanceThemeMiddleware,
  parseInstanceTheme,
  renderInstanceThemeCss,
  withInstanceThemeLink,
} from "./instance-theme";

const dir = path.resolve("/srv/theme");

function themeFolder(theme: unknown, files: Record<string, string> = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), "rakazo-theme-"));
  writeFileSync(path.join(folder, "theme.json"), JSON.stringify(theme));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(folder, name), body);
  return path.join(folder, "theme.json");
}

function serve(themeFile: string, url: string) {
  const res = { setHeader: vi.fn(), end: vi.fn() };
  const next = vi.fn();
  const warn = vi.fn();
  instanceThemeMiddleware(themeFile, warn)(
    { url } as IncomingMessage,
    res as unknown as ServerResponse,
    next,
  );
  return { res, next, warn };
}

describe("instance theme", () => {
  it("renders color overrides per appearance and font stacks", () => {
    const css = renderInstanceThemeCss(
      parseInstanceTheme(
        JSON.stringify({
          dark: { background: "#101418", cardForeground: "#EEEEEE" },
          light: { primary: "#8A4B12" },
          fonts: { sans: "Inter, system-ui, sans-serif" },
          radius: "0.5rem",
        }),
        dir,
      ),
    );
    expect(css).toContain(
      'html[data-theme="dark"] {\n  --background: #101418;\n  --card-foreground: #EEEEEE;\n}',
    );
    expect(css).toContain('html[data-theme="light"] {\n  --primary: #8A4B12;\n}');
    expect(css).toContain(
      "html:root {\n  --font-sans: Inter, system-ui, sans-serif;\n  --radius: 0.5rem;\n}",
    );
  });

  it("serves font files from the instance by their place in the list", () => {
    const theme = parseInstanceTheme(
      JSON.stringify({
        fonts: {
          sans: "Onest",
          files: [{ family: "Onest", file: "fonts/Onest.woff2", weight: "100 900" }],
        },
      }),
      dir,
    );
    expect(theme.fonts.files[0]?.file).toBe(path.join(dir, "fonts/Onest.woff2"));
    const dotted = parseInstanceTheme(
      JSON.stringify({ fonts: { files: [{ family: "Onest", file: "..fonts/Onest.woff2" }] } }),
      dir,
    );
    expect(dotted.fonts.files[0]?.file).toBe(path.join(dir, "..fonts/Onest.woff2"));
    expect(renderInstanceThemeCss(theme)).toContain(
      'src: url("/instance-theme/font/0.woff2") format("woff2");\n  font-weight: 100 900;',
    );
  });

  it.each([
    [{ dark: { notAToken: "#000000" } }, "dark.notAToken is not a token"],
    [
      { dark: { background: "red; } body { display: none" } },
      "dark.background must be a hex color",
    ],
    [
      { fonts: { sans: "x; } * { background: url(https://example.com)" } },
      "fonts.sans must be a font-family list",
    ],
    [{ fonts: { files: [{ family: "Onest", file: "Onest.svg" }] } }, "fonts.files[0].file must be"],
    [{ spacing: "0" }, "spacing is not a theme field"],
    [{ name: "<script>" }, "name must be 1 to 40 characters"],
    [{ name: "a".repeat(41) }, "name must be 1 to 40 characters"],
    [{ icon: "logo.svg" }, "icon must be a .png file"],
    [{ icon: "../logo.png" }, "icon must be inside the theme's folder"],
    [{ radius: "4px; } body { display: none" }, "radius must look like"],
    [
      { fonts: { files: [{ family: "Onest", file: "/etc/Onest.ttf" }] } },
      "inside the theme's folder",
    ],
    [
      { fonts: { files: [{ family: "Onest", file: "../Onest.ttf" }] } },
      "inside the theme's folder",
    ],
  ])("rejects %j", (theme, message) => {
    expect(() => parseInstanceTheme(JSON.stringify(theme), dir)).toThrow(message);
  });

  it("links the theme only on the pages the SPA fallback resolves to the app", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "rakazo-dist-"));
    writeFileSync(path.join(folder, "index.html"), "<html><head><title>x</title></head></html>");
    const middleware = indexPageMiddleware(folder, withInstanceThemeLink);
    const page = (url: string, headers: Record<string, string> = {}) => {
      const res = { setHeader: vi.fn(), end: vi.fn() };
      const next = vi.fn();
      middleware(
        { url, method: "GET", headers } as unknown as IncomingMessage,
        res as unknown as ServerResponse,
        next,
      );
      return { res, next };
    };
    expect(page("/index.html").res.end.mock.calls[0]?.[0]).toBe(
      '<html><head><title>x</title>  <link rel="stylesheet" href="/instance-theme.css" />\n  </head></html>',
    );
    expect(page("/html-viewer.html").next).toHaveBeenCalled();
    expect(page("/index.html", { "sec-fetch-dest": "script" }).next).toHaveBeenCalled();
  });

  it("serves the theme's stylesheet and fonts, and passes other paths on", () => {
    const file = themeFolder(
      {
        dark: { background: "#101418" },
        fonts: { files: [{ family: "Onest", file: "Onest.ttf" }] },
      },
      { "Onest.ttf": "font-bytes" },
    );
    expect(serve(file, "/instance-theme.css?v=1").res.end.mock.calls[0]?.[0]).toContain(
      "--background: #101418;",
    );
    const font = serve(file, "/instance-theme/font/0.ttf");
    expect(font.res.setHeader).toHaveBeenCalledWith("content-type", "font/ttf");
    expect(String(font.res.end.mock.calls[0]?.[0])).toBe("font-bytes");
    expect(serve(file, "/instance-theme/font/1.ttf").next).toHaveBeenCalled();
    expect(serve(file, "/instance-theme/font/..%2Ftheme.json").next).toHaveBeenCalled();
    expect(serve(file, "/").next).toHaveBeenCalled();
  });

  it("refuses a font symlink that points outside the theme's folder", () => {
    const secret = path.join(mkdtempSync(path.join(tmpdir(), "rakazo-secret-")), "secret.txt");
    writeFileSync(secret, "not a font");
    const file = themeFolder({ fonts: { files: [{ family: "Onest", file: "Onest.ttf" }] } });
    symlinkSync(secret, path.join(path.dirname(file), "Onest.ttf"));
    const { res, next, warn } = serve(file, "/instance-theme/font/0.ttf");
    expect(res.end).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("outside the theme's folder"));
  });

  it("logs a broken theme and serves nothing rather than failing the page", () => {
    const file = themeFolder({ dark: { background: "nope" } });
    const { res, warn } = serve(file, "/instance-theme.css");
    expect(res.end).toHaveBeenCalledWith("");
    expect(warn).toHaveBeenCalledWith("dark.background must be a hex color");
  });

  it("names the page and swaps the icons when the theme sets a name and icon", () => {
    const folder = mkdtempSync(path.join(tmpdir(), "rakazo-dist-"));
    writeFileSync(
      path.join(folder, "index.html"),
      '<html><head><meta name="apple-mobile-web-app-title" content="Rakazo" /><link rel="icon" href="/favicon.png" /><title>Rakazo</title></head></html>',
    );
    const file = themeFolder({ name: " JBW ", icon: "logo.png" }, { "logo.png": "png-bytes" });
    const res = { setHeader: vi.fn(), end: vi.fn() };
    indexPageMiddleware(folder, (html) => withInstanceThemeLink(html, instanceIdentity(file)))(
      { url: "/index.html", method: "GET", headers: {} } as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      vi.fn(),
    );
    const html = String(res.end.mock.calls[0]?.[0]);
    expect(html).toContain("<title>JBW</title>");
    expect(html).toContain('content="JBW"');
    expect(html).toContain('<link rel="icon" href="/instance-theme/icon.png" />');
    expect(html).toContain('<meta name="instance-name" content="JBW" />');
    expect(html).toContain('<meta name="instance-icon" content="/instance-theme/icon.png" />');

    const icon = serve(file, "/instance-theme/icon.png");
    expect(icon.res.setHeader).toHaveBeenCalledWith("content-type", "image/png");
    expect(String(icon.res.end.mock.calls[0]?.[0])).toBe("png-bytes");
    const manifest = JSON.parse(
      String(serve(file, "/site.webmanifest").res.end.mock.calls[0]?.[0]),
    );
    expect(manifest.name).toBe("JBW");
    expect(manifest.icons[0].src).toBe("/instance-theme/icon.png");
  });

  it("leaves the manifest and icon to the build when the theme sets neither", () => {
    const file = themeFolder({ dark: { background: "#101418" } });
    expect(serve(file, "/site.webmanifest").next).toHaveBeenCalled();
    expect(serve(file, "/instance-theme/icon.png").next).toHaveBeenCalled();
    expect(JSON.parse(instanceManifest({})).name).toBe("Rakazo");
  });

  it("serves an edited theme without a restart, from one middleware instance", () => {
    const file = themeFolder({ dark: { background: "#101418" } });
    const warn = vi.fn();
    const middleware = instanceThemeMiddleware(file, warn);
    const run = (url: string) => {
      const res = { setHeader: vi.fn(), end: vi.fn() };
      const next = vi.fn();
      middleware({ url } as IncomingMessage, res as unknown as ServerResponse, next);
      return res;
    };
    expect(run("/instance-theme.css").end.mock.calls[0]?.[0]).toContain("--background: #101418;");
    // A different size, so the edit is never mistaken for the same file.
    writeFileSync(
      file,
      JSON.stringify({ dark: { background: "#101418" }, light: { primary: "#00AA00" } }),
    );
    expect(run("/instance-theme.css").end.mock.calls[0]?.[0]).toContain("--primary: #00AA00;");
    expect(warn).not.toHaveBeenCalled();
  });
});
