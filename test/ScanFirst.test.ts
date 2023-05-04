import { assertEquals } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { scanFirst, scanCloseJsBracket } from "../utility/utility.ts";

Deno.test("no matches", function () {
	const [ match, pos ] = scanFirst("abc", 0, []);
	assertEquals(match, "");
	assertEquals(pos, -1);
});

Deno.test("start at end", function () {
	const [ match, pos ] = scanFirst("abc", 4, [ "abc" ]);
	assertEquals(match, "");
	assertEquals(pos, -1);
});

Deno.test("match all once", function () {
	const [ match, pos ] = scanFirst("abc", 0, [ "abc" ]);
	assertEquals(match, "abc");
	assertEquals(pos, 3);
});

Deno.test("basic", function () {
	const [ match, pos ] = scanFirst("xxabc", 0, [ "a", "b", "c" ]);
	assertEquals(match, "a");
	assertEquals(pos, 3);
});

Deno.test("basic2", function () {
	const [ match, pos ] = scanFirst("xxbbcc", 0, [ "aa", "bb", "cc" ]);
	assertEquals(match, "bb");
	assertEquals(pos, 4);
});

Deno.test("overlapping same match", function () {
	const [ match, pos ] = scanFirst("xxabababcdzz", 0, [ "qq", "ababcd" ]);
	assertEquals(match, "ababcd");
	assertEquals(pos, 10);
});

Deno.test("all fail", function () {
	const [ match, pos ] = scanFirst("xxababqmwwwww", 0, [ "qq", "ababcd", "mn" ]);
	assertEquals(match, "");
	assertEquals(pos, -1);
});

Deno.test("js bracket basic", function () {
	const pos = scanCloseJsBracket("(2 + 3) hello", 1, "()");
	assertEquals(pos, 7);
});

Deno.test("js bracket intenral quote", function () {
	const pos = scanCloseJsBracket("(2 + 'my cat\\'s whi)skers' + 3) hello", 1, "()");
	assertEquals(pos, 31);
});

Deno.test("js bracket subbrackets", function () {
	const pos = scanCloseJsBracket("(2 + abc[(2 = 1)] + 3) hello", 1, "()");
	assertEquals(pos, 22);
});