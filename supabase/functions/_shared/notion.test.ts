import { assertEquals } from "jsr:@std/assert@1";
import { notionTitle } from "./source-sync.ts";

const rich = (s: string) => [{ type: "text", plain_text: s, text: { content: s } }];

Deno.test("notion: page title comes from its title property", () => {
  assertEquals(notionTitle({ object: "page", properties: { Name: { type: "title", title: rich("Launch plan") } } }), "Launch plan");
});

Deno.test("notion: a database's title is top-level; its title column is a schema object, not rich text", () => {
  // The shape that broke two live connections: properties.Name.title is {}.
  const db = { object: "database", title: rich("Reading list"), properties: { Name: { id: "title", type: "title", title: {} } } };
  assertEquals(notionTitle(db), "Reading list");
});

Deno.test("notion: database without a name, schema title only -> Untitled, no throw", () => {
  assertEquals(notionTitle({ object: "database", title: [], properties: { Name: { type: "title", title: {} } } }), "Untitled");
});

Deno.test("notion: multi-segment rich text is joined; text.content fallback", () => {
  assertEquals(notionTitle({ properties: { T: { type: "title", title: [{ plain_text: "Q4 " }, { text: { content: "goals" } }] } } }), "Q4 goals");
});

Deno.test("notion: odd shapes never throw", () => {
  for (const x of [null, undefined, 42, "x", {}, { properties: null }, { properties: { a: null } }, { title: "str" }, { properties: { T: { type: "title", title: null } } }, { properties: { T: { type: "title", title: [null, 5] } } }]) {
    assertEquals(notionTitle(x), "Untitled");
  }
});
