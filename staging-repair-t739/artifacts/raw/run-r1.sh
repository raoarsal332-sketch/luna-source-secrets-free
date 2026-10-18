#!/bin/bash
set -u
cd /workspace/staging-repair-t739
OUT=/workspace/staging-repair-t739/artifacts/raw
run() {
  local name="$1"
  shift
  echo "RUN $name"
  unshare -rn "$@" > "$OUT/$name.out" 2>&1
  echo $? > "$OUT/$name.rc"
  echo "DONE $name rc=$(cat "$OUT/$name.rc")"
}
for t in t1_detector t2_transport t3_faq_language_module t4_logs t5_isolation t6_modules t7_corpus_equivalence t8_remediation_r1; do
  run "cand_$t" node "tests/$t.js"
done
for t in t2_transport t3_faq_language_module t4_logs t6_modules t7_corpus_equivalence t8_remediation_r1; do
  run "base_$t" env TREE=baseline node "tests/$t.js"
done
unshare -rn bash -c 'cd /tmp/int/packs && node tests/run-author-tests.js' > "$OUT/packs_author.out" 2>&1
echo $? > "$OUT/packs_author.rc"
echo "DONE packs rc=$(cat "$OUT/packs_author.rc")"
unshare -rn bash -c 'cd /tmp/int/atom && bash tests/run_all.sh' > "$OUT/atom_author.out" 2>&1
echo $? > "$OUT/atom_author.rc"
echo "DONE atom rc=$(cat "$OUT/atom_author.rc")"
echo ALL_DONE
