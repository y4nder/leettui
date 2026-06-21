// LeetCode → Java type mapping for the Java local harness (Stage 25, the *third*
// compiled language after rust and csharp). Like rust/csharp, Java is statically
// typed, so each stdin arg must be parsed into the *exact* concrete type from the
// solution signature, and the result serialized back to JSON. That needs a
// LeetCode-type → Java-type map, which lives here (mirroring `csharp.ts`).
//
// The wrinkle that makes Java unlike csharp: **the JDK ships no JSON library**
// (csharp's `System.Text.Json` is in-framework; rust fetches serde). Rather than
// drag in Maven/Gradle + Gson (a heavy toolchain + network fetch), the harness
// embeds a tiny dependency-free JSON parse/serialize directly in `main.java`, so
// the only toolchain requirement is the JDK (`javac`/`java`) — the clean analogue
// of "the rust toolchain"/"the .NET SDK". The embedded `convert(node, T.class)` +
// `toJson` helpers are *generic + reflective*, so per-arg codegen stays a single
// line (`T name = (T) convert(parseJson(lines[i]), T.class);`) — `int[][].class`
// etc. are valid Java, so all array generality lives in the fixed helper block,
// not in per-type codegen.

import { type HarnessFile, type MetaData, DEFERRED_TYPES, baseType } from "./meta";

// LeetCode scalar metaData types → their concrete Java types. A JSON number/
// string/bool parses into these via the embedded parser: a 1-char JSON string
// becomes `char`, a JSON array becomes a Java array (`T[]`).
const SCALAR_MAP: Record<string, string> = {
  integer: "int",
  long: "long",
  string: "String",
  double: "double",
  boolean: "boolean",
  character: "char",
};

// Maps a LeetCode metaData type to a concrete Java type, or null when the type
// isn't mappable — a deferred `ListNode`/`TreeNode` (no real deserializer yet,
// and a non-mappable type is a *compile* error in Java, not a passthrough) or an
// unknown scalar. Array markers append `[]` per depth: "integer[]" → "int[]",
// "integer[][]" → "int[][]".
export function javaType(leetType: string): string | null {
  const base = baseType(leetType);
  if (DEFERRED_TYPES.has(base)) return null;
  const scalar = SCALAR_MAP[base];
  if (!scalar) return null;
  const depth = (leetType.match(/\[\]/g) ?? []).length;
  return scalar + "[]".repeat(depth);
}

// The Java type of the solution's return value. A `void` return (in-place
// problems like `setZeroes`) is kept as the literal `"void"` so the generator can
// special-case it — calling the method without assigning a result and printing
// `null`, the analogue of rust's `()`→`null` and csharp's `void`. Returns null
// when the declared return type is unmappable (a deferred type).
export function javaReturnType(meta: MetaData): string | null {
  return meta.return.type === "void" ? "void" : javaType(meta.return.type);
}

// True when every param type and the return type maps to a concrete Java type.
// A signature touching any `DEFERRED_TYPES` member (or an unknown scalar) is
// unmappable, so the generator emits a blank `solution.java` stub (no harness)
// rather than uncompilable Java.
export function isJavaMappable(meta: MetaData): boolean {
  return javaReturnType(meta) !== null && meta.params.every((p) => javaType(p.type) !== null);
}

// Renders the per-arg parse lines (8-space indented for a `main` body):
//   `        {T} {name} = ({T}) convert(parseJson(lines[{i}]), {T}.class);`
// `lines[i]` is the i-th stdin line (a String). The generic embedded `convert`
// turns the parsed JSON node into the concrete `T` (a primitive unboxes via the
// cast; a `T[]` casts directly). `{T}.class` is a valid class literal for every
// mapped type, incl. `int[][].class`. Returns null when any param is unmappable.
export function renderJavaArgReads(meta: MetaData): string | null {
  const lines = meta.params.map((p, i) => {
    const t = javaType(p.type);
    return t === null
      ? null
      : `        ${t} ${p.name} = (${t}) convert(parseJson(lines[${i}]), ${t}.class);`;
  });
  return lines.includes(null) ? null : lines.join("\n");
}

// Prepended to the LeetCode snippet before it's written to `solution.java`. The
// Java analogue of csharp's `<ImplicitUsings>`: LeetCode's Java judge auto-imports
// `java.util` (its starter code declares `List<…>`/`Map<…>` with no visible
// import), so a bare snippet whose body uses `HashMap`/`List`/`Arrays` compiles on
// LeetCode but fails local `javac` with "cannot find symbol". Prepending
// `import java.util.*;` fixes that. It stays **submittable** — a redundant
// `import java.util.*;` is legal Java, never an error — but the on-disk file is no
// longer byte-identical to the starter (the rust-shim caveat's analogue). Coupled
// to harness presence in `create.ts`, so an unmappable `ListNode` signature — which
// gets no harness — keeps the plain, import-free snippet (same as rust).
export function prepareJavaSolution(code: string): string {
  return `import java.util.*;\n\n${code}`;
}

// Assembles the full Java harness file set for a mappable signature, or null when
// `isJavaMappable` rejects it (a deferred `ListNode`/`TreeNode` or unknown scalar)
// — the caller then writes a blank `solution.java` stub, since a non-mappable type
// is a hard *compile* error in Java.
//
// Two files (no build manifest — `javac` compiles the sources directly, unlike
// rust's `Cargo.toml`/csharp's `.csproj`):
//   - `.gitignore` — ignores the per-problem `*.class` build output (Stage-10 the
//     solutions tree is git-pushable, so build artifacts shouldn't ride along).
//   - `main.java` — a package-private `class Main` (Java forbids `public class
//     Main` in a file not named `Main.java`; the launcher only requires `main`
//     itself to be public, not the class). It reads stdin lines, runs the typed
//     `convert(parseJson(…), T.class)` per arg, calls `new Solution().{fn}(...)`,
//     and prints `toJson(result)`. **No name-case conversion** — LeetCode's Java
//     method is already camelCase, same as `metaData.name` (unlike rust's
//     snake_case / csharp's PascalCase). `solution.java` (LeetCode's bare,
//     package-private `class Solution`) is co-compiled in the same default package
//     (`javac solution.java main.java`), so the harness just references
//     `new Solution()` with no wrapper. A `void` return calls without assignment
//     and prints `null` (matching rust's `()` / csharp's `void`).
//
// The embedded JSON helpers (`parseJson`/`convert`/`toJson`/`quote`) are a fixed
// block — generic + reflective, so they cover every mapped type with no per-type
// codegen and keep the harness JDK-only (no Gson/Maven/Gradle dependency).
export function generateJavaHarness(meta: MetaData): HarnessFile[] | null {
  const argReads = renderJavaArgReads(meta);
  const ret = javaReturnType(meta);
  if (argReads === null || ret === null) return null;

  const fn = meta.name;
  const argList = meta.params.map((p) => p.name).join(", ");

  const call =
    ret === "void"
      ? `        new Solution().${fn}(${argList});\n        System.out.println("null");`
      : `        var result = new Solution().${fn}(${argList});\n        System.out.println(toJson(result));`;

  const gitignore = "*.class\n";

  const mainJava = `import java.util.*;
import java.lang.reflect.Array;

class Main {
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        String[] lines = input.split("\\n", -1);
${argReads}
${call}
    }

    // --- Embedded dependency-free JSON (scalars + nested arrays only) ---------

    static int p;
    static String s;

    static Object parseJson(String str) {
        s = str;
        p = 0;
        return parseValue();
    }

    static Object parseValue() {
        skipWs();
        char c = s.charAt(p);
        if (c == '[') return parseArray();
        if (c == '"') return parseString();
        if (c == 't' || c == 'f') return parseBool();
        if (c == 'n') { p += 4; return null; }
        return parseNumber();
    }

    static void skipWs() {
        while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++;
    }

    static List<Object> parseArray() {
        List<Object> list = new ArrayList<>();
        p++; // consume '['
        skipWs();
        if (s.charAt(p) == ']') { p++; return list; }
        while (true) {
            list.add(parseValue());
            skipWs();
            char c = s.charAt(p++);
            if (c == ']') break;
            skipWs();
        }
        return list;
    }

    static String parseString() {
        StringBuilder sb = new StringBuilder();
        p++; // consume opening quote
        while (true) {
            char c = s.charAt(p++);
            if (c == '"') break;
            if (c == '\\\\') {
                char e = s.charAt(p++);
                switch (e) {
                    case 'n': sb.append('\\n'); break;
                    case 't': sb.append('\\t'); break;
                    case 'r': sb.append('\\r'); break;
                    case 'b': sb.append('\\b'); break;
                    case 'f': sb.append('\\f'); break;
                    case 'u':
                        sb.append((char) Integer.parseInt(s.substring(p, p + 4), 16));
                        p += 4;
                        break;
                    default: sb.append(e);
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    static Boolean parseBool() {
        if (s.charAt(p) == 't') { p += 4; return Boolean.TRUE; }
        p += 5;
        return Boolean.FALSE;
    }

    static Object parseNumber() {
        int start = p;
        while (p < s.length() && "+-0123456789.eE".indexOf(s.charAt(p)) >= 0) p++;
        String num = s.substring(start, p);
        if (num.indexOf('.') >= 0 || num.indexOf('e') >= 0 || num.indexOf('E') >= 0) {
            return Double.parseDouble(num);
        }
        return Long.parseLong(num);
    }

    @SuppressWarnings("unchecked")
    static Object convert(Object o, Class<?> t) {
        if (t.isArray()) {
            Class<?> ct = t.getComponentType();
            List<Object> a = (List<Object>) o;
            Object arr = Array.newInstance(ct, a.size());
            for (int i = 0; i < a.size(); i++) Array.set(arr, i, convert(a.get(i), ct));
            return arr;
        }
        if (t == int.class) return ((Number) o).intValue();
        if (t == long.class) return ((Number) o).longValue();
        if (t == double.class) return ((Number) o).doubleValue();
        if (t == boolean.class) return o;
        if (t == char.class) return ((String) o).charAt(0);
        return o; // String
    }

    static String toJson(Object o) {
        if (o == null) return "null";
        if (o instanceof String || o instanceof Character) return quote(o.toString());
        if (o instanceof Boolean || o instanceof Number) return String.valueOf(o);
        if (o.getClass().isArray()) {
            StringBuilder sb = new StringBuilder("[");
            int n = Array.getLength(o);
            for (int i = 0; i < n; i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(Array.get(o, i)));
            }
            return sb.append("]").toString();
        }
        return quote(o.toString());
    }

    static String quote(String str) {
        StringBuilder sb = new StringBuilder("\\"");
        for (int i = 0; i < str.length(); i++) {
            char c = str.charAt(i);
            if (c == '"' || c == '\\\\') sb.append('\\\\').append(c);
            else if (c == '\\n') sb.append("\\\\n");
            else if (c == '\\t') sb.append("\\\\t");
            else if (c == '\\r') sb.append("\\\\r");
            else sb.append(c);
        }
        return sb.append("\\"").toString();
    }
}
`;

  return [
    { filename: ".gitignore", content: gitignore },
    { filename: "main.java", content: mainJava },
  ];
}
