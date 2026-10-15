import { beforeEach } from "vitest";
import { db } from "../src/lib/db";
beforeEach(() => { localStorage.clear(); db._reset(); });
