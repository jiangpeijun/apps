#!/usr/bin/env node
/**
 * 下载 Saleor GraphQL schema + webhook JSON schema。
 * 与官方脚本的差异：多源回退（国内网络友好）、已存在合法文件默认跳过、原子写入。
 * --force 强制重下。
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force");

const { schemaVersion } = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
).config.saleor as { schemaVersion: string };

const upstream = `raw.githubusercontent.com/saleor/saleor/${schemaVersion}/saleor`;

const mirrors = [
  (p: string) => `https://raw.githubusercontent.com/saleor/saleor/${schemaVersion}/saleor/${p}`,
  (p: string) => `https://cdn.jsdelivr.net/gh/saleor/saleor@${schemaVersion}/saleor/${p}`,
  (p: string) => `https://ghfast.top/https://${upstream}/${p}`,
  (p: string) => `https://gh-proxy.com/https://${upstream}/${p}`,
  (p: string) => `https://ghproxy.net/https://${upstream}/${p}`,
];

const jsonSchemaNames = [
  "ListStoredPaymentMethods",
  "PaymentGatewayInitializeSession",
  "StoredPaymentMethodDeleteRequested",
  "TransactionCancelationRequested",
  "TransactionChargeRequested",
  "TransactionInitializeSession",
  "TransactionProcessSession",
  "TransactionRefundRequested",
];

const validSchema = (file: string) => {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  return text.startsWith("schema {") && text.length > 200_000;
};

const validJsonSchema = (file: string) => {
  if (!existsSync(file)) return false;
  try {
    return "properties" in JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
};

const saveAtomic = (file: string, content: string) => {
  const tmp = `${file}.download`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
};

async function download(
  remotePath: string,
  localPath: string,
  opts: { required: boolean; validate: (file: string) => boolean },
): Promise<boolean> {
  const file = path.join(root, localPath);

  if (!FORCE && opts.validate(file)) {
    console.log(`✔ skip（已存在且合法）${localPath}`);
    return true;
  }

  for (const build of mirrors) {
    const url = build(remotePath);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        redirect: "follow",
      });
      if (!res.ok) {
        console.warn(`  ✖ ${res.status} ${url}`);
        continue;
      }
      const text = await res.text();
      if (text.length < 100) {
        console.warn(`  ✖ 内容为空 ${url}`);
        continue;
      }
      saveAtomic(file, text);
      console.log(`✔ ${localPath}  ←  ${url}  (${text.length} bytes)`);
      return true;
    } catch {
      console.warn(`  ✖ 连接失败 ${url}`);
    }
  }

  if (opts.required) {
    throw new Error(`所有源都失败，无法获取必需文件: ${localPath}`);
  }
  console.warn(`⚠ 跳过（非必需）${localPath}`);
  return false;
}

/** apps/<app>/graphql/schema.graphql 应指向仓库根 schema.graphql；已存在则绝不动它 */
function ensureAppSchemaLink() {
  const link = path.join(root, "apps/adyen/graphql/schema.graphql");
  mkdirSync(path.dirname(link), { recursive: true });

  if (existsSync(link)) {
    console.log("✔ apps/adyen/graphql/schema.graphql 已存在，未改动");
    return;
  }

  try {
    symlinkSync("../../../schema.graphql", link, "file");
    console.log("✔ 已创建 symlink apps/adyen/graphql/schema.graphql");
  } catch {
    writeFileSync(link, readFileSync(path.join(root, "schema.graphql"), "utf8"));
    console.log("⚠ 无权限创建 symlink，已改为实体文件拷贝（git 里会显示 modified）");
  }
}

async function main() {
  mkdirSync(path.join(root, "saleor-json-schemas"), { recursive: true });

  await download("graphql/schema.graphql", "schema.graphql", {
    required: true,
    validate: validSchema,
  });

  await Promise.all(
    jsonSchemaNames.map((name) =>
      download(`json_schemas/${name}.json`, `saleor-json-schemas/${name}.json`, {
        required: false,
        validate: validJsonSchema,
      }),
    ),
  );

  ensureAppSchemaLink();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
