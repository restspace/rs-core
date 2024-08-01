import { assert, assertEquals, assertStrictEquals } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { Url } from '../Url.ts';

Deno.test('sets service path correctly', function () {
    const url = new Url('/base1/base2/sp1');
    url.basePathElementCount = 2;
    url.servicePath = '/spx/spy';
    assertEquals(url.path, '/base1/base2/spx/spy');
    assert(!url.isRelative);
});
Deno.test('sets subpath correctly', function () {
    const url = new Url('/base1/base2/sp1/sup1/sup2');
    url.basePathElementCount = 2;
    url.setSubpathFromUrl('/base1/base2/sp1');
    assertEquals(url.subPathElements, [ 'sup1', 'sup2' ]);
});
Deno.test('sets subpath correctly, empty', function () {
    const url = new Url('/base1/base2/sp1');
    url.basePathElementCount = 2;
    url.setSubpathFromUrl('/base1/base2/sp1');
    assertEquals(url.subPathElements, [ ]);
    assertEquals(url.subPathElementCount, 0);
});
Deno.test('sets subpath correctly, empty', function () {
    const url = new Url('/base1/base2/sp1');
    url.basePathElementCount = 2;
    url.setSubpathFromUrl('/base1/base2/sp1');
    assertEquals(url.subPathElements, [ ]);
    assertEquals(url.subPathElementCount, 0);
});
Deno.test('creates a url correctly from a root path', function () {
    const url = Url.fromPath('/');
    assertEquals(url.path, '/');
    assert(!url.isRelative);
});
Deno.test('creates a url correctly from a host with root', function () {
    const url = new Url('http://abc.com/');
    assert(url.isDirectory);
    assert(!url.isRelative);
});
Deno.test('creates a url correctly from a service with dir', function () {
    const url = new Url('http://abc.com/service/');
    assert(url.isDirectory);
    assert(!url.isRelative);
    assertEquals(url.servicePath, 'service/');
    assertEquals(url.servicePathElements, ['service']);
});
Deno.test('creates a url correctly from a service without dir', function () {
    const url = new Url('http://abc.com/service');
    assert(!url.isDirectory);
    assert(!url.isRelative);
    assertEquals(url.servicePath, 'service');
    assertEquals(url.servicePathElements, ['service']);
});
Deno.test('relative path', () => {
    const url = new Url('abc/def');
    assertEquals(url.path, 'abc/def');
    assert(url.isRelative);
});
Deno.test('root domain', () => {
    const url = new Url('https://abc.co.uk');
    assertEquals(url.domain, 'abc.co.uk');
});
Deno.test('query string', () => {
    const url = new Url('/?abc=def');
    assertEquals(url.query['abc'][0], 'def');
});
Deno.test('relative query string', () => {
    const url = new Url('?abc=def');
    assertEquals(url.query['abc'][0], 'def');
    assertEquals(url.toString(), '?abc=def');
    assert(url.isRelative);
});
Deno.test('query string on root domain', () => {
    const url = new Url('http://spot.com?bn1=yyy');
    assertEquals(url.queryString, 'bn1=yyy');
    assert(!url.isRelative);
});
Deno.test('full url', () => {
    const url = new Url('http://spot.com/abc/def?mno=pqr&abc=def#123');
    assertEquals(url.domain, 'spot.com');
    assertEquals(url.scheme, 'http://');
    assertEquals(url.path, '/abc/def');
    assertEquals(url.query['abc'][0], 'def');
    assertEquals(url.fragment, '123');
    assert(!url.isRelative);
});
Deno.test('relative fragment', () => {
    const url = new Url('#xyz');
    assertEquals(url.fragment, 'xyz');
    assertEquals(url.toString(), '#xyz');
    assert(url.isRelative);
});
Deno.test('copy abs', () => {
    const url = new Url('http://spot.com/abc/def?mno=pqr&abc=def#123');
    const url2 = url.copy();
    assertEquals(url.toString(), url2.toString());
});
Deno.test('copy rel', () => {
    const url = new Url('abc/def?mno=pqr&abc=def#123');
    const url2 = url.copy();
    assertEquals(url.toString(), url2.toString());
});
Deno.test('copy site rel', () => {
    const url = new Url('/abc/def?mno=pqr&abc=def#123&qqq');
    const url2 = url.copy();
    assertEquals(url.toString(), url2.toString());
});
Deno.test('encodings slash', () => {
    const url = new Url('/abc/def%2Fghi?mno=pqr&abc=def#123');
    assertEquals(url.pathElements[1], 'def%2Fghi');
    assertEquals(url.toString(), '/abc/def%2Fghi?mno=pqr&abc=def#123');
});
Deno.test('encodings space path output unencoded', () => {
    const url = new Url('/abc/def%20ghi?mno=pqr&abc=def#123');
    assertEquals(url.pathElements[1], 'def ghi');
    assertEquals(url.toString(), '/abc/def ghi?mno=pqr&abc=def#123');
});
Deno.test('encodings space query output unencoded', () => {
    const url = new Url('/abc/def/ghi?mno=pq r&abc=def#123');
    assertEquals(url.query['mno'][0], 'pq r');
    assertEquals(url.toString(), '/abc/def/ghi?mno=pq r&abc=def#123');
});
Deno.test('subtitution syntax legal', () => {
    const url = new Url('/abc/def${ghi}?mno=pqr&abc=def#123');
    assertEquals(url.pathElements[1], 'def${ghi}');
    assertEquals(url.toString(), '/abc/def${ghi}?mno=pqr&abc=def#123');
});
Deno.test('follow simple relative', () => {
    const url = new Url('/abc/def?mno=pqr&abc=def#123');
    const followUrl = url.follow('xxx');
    assertEquals(followUrl.toString(), '/abc/def/xxx');
});
Deno.test('follow abs is abs', () => {
    const url = new Url('/abc/def?mno=pqr&abc=def#123');
    const followUrl = url.follow('http://spot.com/xxx');
    assertEquals(followUrl.toString(), 'http://spot.com/xxx');
});
Deno.test('follow up one', () => {
    const url = new Url('/abc/def?mno=pqr&abc=def#123');
    const followUrl = url.follow('../xxx');
    assertEquals(followUrl.toString(), '/abc/xxx');
});
Deno.test('follow query string', () => {
    const url = new Url('/abc/def?mno=pqr&abc=def#123');
    const followUrl = url.follow('?mno=stu');
    assertEquals(followUrl.toString(), '/abc/def?mno=stu');
});
Deno.test('follow fragment', () => {
    const url = new Url('/abc/def?mno=pqr&abc=def#123');
    const followUrl = url.follow('#456');
    assertEquals(followUrl.toString(), '/abc/def?mno=pqr&abc=def#456');
});
Deno.test('follow dir no change', () => {
    const url = new Url('/abc/def/?mno=pqr&abc=def#123');
    const followUrl = url.follow('#456');
    assertEquals(followUrl.toString(), '/abc/def/?mno=pqr&abc=def#456');
});
Deno.test('follow dir change', () => {
    const url = new Url('/abc/def/?mno=pqr&abc=def#123');
    const followUrl = url.follow('../xxx');
    assertEquals(followUrl.toString(), '/abc/xxx');
});
