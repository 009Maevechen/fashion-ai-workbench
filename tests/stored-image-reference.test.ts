import assert from "node:assert/strict";
import test from "node:test";
import {canonicalStoredImageReference,resolveStoredImageReference} from "../src/lib/stored-image-reference";

test("keeps canonical workbench paths",()=>assert.equal(canonicalStoredImageReference("/api/files/SKU/uploads/model.jpg"),"/api/files/SKU/uploads/model.jpg"));
test("normalizes Windows separators",()=>assert.equal(canonicalStoredImageReference("\\api\\files\\SKU\\uploads\\model.jpg"),"/api/files/SKU/uploads/model.jpg"));
test("extracts the path from an older absolute desktop URL",()=>assert.equal(canonicalStoredImageReference("http://127.0.0.1:32145/api/files/SKU/uploads/model.jpg"),"/api/files/SKU/uploads/model.jpg"));
test("uses the persisted asset when the page still holds a blob preview",()=>assert.equal(resolveStoredImageReference("blob:http://127.0.0.1/temp","/api/files/SKU/uploads/model.jpg","模特参考图"),"/api/files/SKU/uploads/model.jpg"));
test("rejects an unsaved preview without a persisted fallback",()=>assert.throws(()=>resolveStoredImageReference("blob:http://127.0.0.1/temp",undefined,"模特参考图"),/模特参考图未完成本地保存/));
