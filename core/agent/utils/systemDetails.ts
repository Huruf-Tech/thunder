export function getSystemDetails() {
  return {
    os: Deno.build.os,
    arch: Deno.build.arch,
    target: Deno.build.target,
    deno: Deno.version.deno,
    v8: Deno.version.v8,
    typescript: Deno.version.typescript,
    cwd: Deno.cwd(),
    osRelease: Deno.osRelease(),
  };
}
