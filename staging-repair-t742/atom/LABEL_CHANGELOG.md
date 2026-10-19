# Atom dev-set label changelog

## Revision ad6169bb

Authority: branch t742-design, commit `ad6169bb671ca5369932d69a31aedfc476b0824c`, doc sha256 `5529a4878d4ef6adbce88875021a5f14b1eb77260bc9e11a4d48be8f26e52677`.

The scored public result is the gold-table router outcome. `acceptableSet` is metadata. `claim` is re-derived from section (e), not from the detector hand map.

Claim kind changes on confusable or zero-width rows: 0.

Re-derived and unchanged: AD351 (U+0410 skeletons to A, then lowercase, so the token is atom; kind stays exclusive). AD349 (digit 0 is not rewritten; at0m stays none, obfuscated). AD352 (U+200B deleted; atom1step is not the token atom; kind stays none, obfuscated). AD353 (spaced letters join to atom; kind stays exclusive).

Rows in this pass: 412.


Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD001 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD002 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD003 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD004 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD005 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD006 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD007 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD008 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD009 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD010 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD011 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD012 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD013 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD014 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.phases.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.checkout.options.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD015 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD016 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD017 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD018 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD019 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD020 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD021 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD022 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD023 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD024 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD025 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD026 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD027 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD028 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD029 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD030 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD031 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD032 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD033 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD034 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD035 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD036 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD037 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD038 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD039 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD040 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD041 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD042 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD043 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD044 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.news.en, atom.2step.news.en). The scored send, when decide runs, is only atom.2step.news.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD045 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD046 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD047 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.news.en, atom.2step.news.en). The scored send, when decide runs, is only atom.2step.news.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD048 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD049 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD050 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.2step.leverage.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD051 | SEND atom.2step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.leverage.en","contentHash":"9359b2fb2ce639351a49f157e876df5d3645c51188bf1f6a47f9ed1b303d65da"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD052 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.2step.leverage.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD053 | SEND atom.2step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.leverage.en","contentHash":"9359b2fb2ce639351a49f157e876df5d3645c51188bf1f6a47f9ed1b303d65da"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD054 | SEND atom.2step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.leverage.en","contentHash":"9359b2fb2ce639351a49f157e876df5d3645c51188bf1f6a47f9ed1b303d65da"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.reward.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.2step.reward.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD055 | SEND atom.2step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.reward.en","contentHash":"07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD056 | SEND atom.2step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.reward.en","contentHash":"07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD057 | SEND atom.2step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.reward.en","contentHash":"07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD058 | SEND atom.2step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.reward.en","contentHash":"07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD059 | SEND atom.2step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.reward.en","contentHash":"07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD060 | SEND atom.2step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.reward.en","contentHash":"07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD061 | SEND atom.1step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.phases.en","contentHash":"2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.phases.en, atom.obsolete.10pct-1step.en). The scored send, when decide runs, is only atom.obsolete.10pct-1step.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD062 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD063 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD064 | SEND atom.1step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.phases.en","contentHash":"2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.phases.en, atom.obsolete.10pct-1step.en). The scored send, when decide runs, is only atom.1step.phases.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD065 | SEND atom.1step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.phases.en","contentHash":"2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD066 | SEND atom.1step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.phases.en","contentHash":"2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD067 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD068 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD069 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD070 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD071 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD072 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD073 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD074 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD075 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD076 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD077 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD078 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD079 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD080 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD081 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.funded-profitable-days.en, atom.1step.min-days.en). The scored send, when decide runs, is only atom.1step.funded-profitable-days.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD082 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD083 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD084 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.funded-profitable-days.en, atom.1step.min-days.en). The scored send, when decide runs, is only atom.1step.funded-profitable-days.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD085 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD086 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.funded-profitable-days.en, atom.1step.min-days.en). The scored send, when decide runs, is only atom.1step.min-days.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD087 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.funded-profitable-days.en, atom.1step.min-days.en). The scored send, when decide runs, is only atom.1step.funded-profitable-days.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD088 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD089 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.funded-profitable-days.en, atom.1step.min-days.en). The scored send, when decide runs, is only atom.1step.funded-profitable-days.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD090 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD091 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD092 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD093 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD094 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD095 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD096 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD097 | SEND atom.1step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.news.en","contentHash":"8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.news.en, atom.2step.news.en). The scored send, when decide runs, is only atom.2step.news.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD098 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD099 | SEND atom.1step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.news.en","contentHash":"8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD100 | SEND atom.1step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.news.en","contentHash":"8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.news.en, atom.2step.news.en). The scored send, when decide runs, is only atom.2step.news.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD101 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD102 | SEND atom.1step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.news.en","contentHash":"8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD103 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD104 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD105 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD106 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD107 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.1step.leverage.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD108 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.reward.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.1step.reward.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD109 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD110 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD111 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD112 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD113 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD114 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.first-payout-14.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.obsolete.first-payout-14.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD115 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.checkout.options.en, atom.obsolete.first-payout-14.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.obsolete.first-payout-14.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD116 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.checkout.options.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.payouts.general.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD117 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD118 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD119 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD120 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD121 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.first-payout-14.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.obsolete.first-payout-14.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD122 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD123 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.price-161-permanent.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.price-161-permanent.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD124 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD125 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD126 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD127 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD128 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.price-161-permanent.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.price-161-permanent.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD129 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD130 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD131 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD132 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD133 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD134 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD135 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD136 | SEND atom.bundles.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.bundles.en","contentHash":"c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

The host string contains both the atom token and a pack/packs token, so kind is none. decide is not called. The scored result on both flags is the main route: no module body, not terminal silence. V12 and spread may send their own approved output. atom.bundles.en is not emitted.

| row | old | new |
|---|---|---|
| AD137 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD138 | SEND atom.bundles.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.bundles.en","contentHash":"c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

The host string contains both the atom token and a pack/packs token, so kind is none. decide is not called. The scored result on both flags is the main route: no module body, not terminal silence. V12 and spread may send their own approved output. atom.bundles.en is not emitted.

| row | old | new |
|---|---|---|
| AD139 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |
| AD140 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD141 | SEND atom.bundles.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.bundles.en","contentHash":"c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD142 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD143 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD144 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD145 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD146 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD147 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.house.simulated.en, atom.overview.en). The scored send, when decide runs, is only atom.house.simulated.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD148 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD149 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD150 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD151 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.house.simulated.en, atom.overview.en). The scored send, when decide runs, is only atom.overview.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD152 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD153 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.phases.en, atom.obsolete.10pct-1step.en). The scored send, when decide runs, is only atom.obsolete.10pct-1step.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD154 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD155 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD156 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.phases.en, atom.obsolete.10pct-1step.en). The scored send, when decide runs, is only atom.1step.phases.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD157 | SEND atom.1step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.phases.en","contentHash":"2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.phases.en, atom.obsolete.10pct-1step.en). The scored send, when decide runs, is only atom.obsolete.10pct-1step.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD158 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD159 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.first-payout-14.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.obsolete.first-payout-14.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD160 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD161 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD162 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD163 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD164 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD165 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD166 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.1step.leverage.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD167 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.2step.leverage.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD168 | SEND atom.2step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.leverage.en","contentHash":"9359b2fb2ce639351a49f157e876df5d3645c51188bf1f6a47f9ed1b303d65da"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD169 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD170 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD171 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD172 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.price-161-permanent.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.price-161-permanent.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD173 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD174 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD175 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD176 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD177 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD178 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.sizes-5k-10k.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.sizes-5k-10k.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD179 | SEND atom.obsolete.sizes-5k-10k.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.sizes-5k-10k.en","contentHash":"dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD180 | SEND atom.obsolete.sizes-5k-10k.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.sizes-5k-10k.en","contentHash":"dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD181 | SEND atom.obsolete.sizes-5k-10k.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.sizes-5k-10k.en","contentHash":"dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD182 | SEND atom.obsolete.sizes-5k-10k.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.sizes-5k-10k.en","contentHash":"dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD183 | SEND atom.obsolete.sizes-5k-10k.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.sizes-5k-10k.en","contentHash":"dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD184 | SEND atom.obsolete.sizes-5k-10k.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.sizes-5k-10k.en","contentHash":"dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.reward.en, atom.2step.reward.en, atom.checkout.options.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.1step.reward.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD185 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.reward.en, atom.2step.reward.en, atom.checkout.options.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.payouts.general.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD186 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD187 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD188 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD189 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD190 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD191 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD192 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD193 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

The host string contains both the atom token and a pack/packs token, so kind is none. decide is not called. The scored result on both flags is the main route: no module body, not terminal silence. V12 and spread may send their own approved output. atom.bundles.en is not emitted.

| row | old | new |
|---|---|---|
| AD194 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD195 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD196 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD197 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD198 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD199 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD200 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD201 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD202 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD203 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD204 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD205 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD206 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD207 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD208 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD209 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD210 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD211 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD212 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD213 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD214 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD215 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD216 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD217 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD218 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD219 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD220 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD221 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD222 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD223 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD224 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD225 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD226 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD227 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD228 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

The host string contains both the atom token and a pack/packs token, so kind is none. decide is not called. The scored result on both flags is the main route: no module body, not terminal silence. V12 and spread may send their own approved output. atom.bundles.en is not emitted.

| row | old | new |
|---|---|---|
| AD229 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD230 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD231 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD232 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD233 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD234 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

AD235 asks for the daily-loss rule and whether the customer personally passed. atom.account-status.refuse.en states that Luna cannot confirm an individual account. It does not state the daily-loss percent. The daily-loss body does not state personal status. Exclusive mixed scores that refuse id and no product part, and only when decide runs. Flag off is F1 silence, so the refuse id is not sent.

| row | old | new |
|---|---|---|
| AD235 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|mixed|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD236 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD237 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD238 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD239 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD240 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD241 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD242 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD243 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD244 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD245 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD246 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD247 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD248 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD249 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD250 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD251 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD252 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD253 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD254 | ABSTAIN atom-clarification | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-clarification","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD255 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD256 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD257 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD258 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD259 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD260 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD261 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD262 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD263 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD264 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD265 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD266 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD267 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD268 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD269 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD270 | ABSTAIN COVERAGE_DENIED | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"COVERAGE_DENIED","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD271 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD272 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD273 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD274 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD275 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD276 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD277 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD278 | ABSTAIN unresolved-policy policy.fee-refunds | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.fee-refunds"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD279 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD280 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD281 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD282 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD283 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD284 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD285 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD286 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD287 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD288 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD289 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD290 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD291 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD292 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD293 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD294 | ABSTAIN unresolved-policy policy.news-minutes | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.news-minutes"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD295 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD296 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD297 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD298 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD299 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD300 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD301 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD302 | ABSTAIN unresolved-policy policy.sku | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.sku"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD303 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD304 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD305 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD306 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD307 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD308 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD309 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD310 | ABSTAIN unresolved-policy policy.translations | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.translations"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD311 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD312 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD313 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD314 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD315 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD316 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD317 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD318 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

atom.account-status.refuse.en states that Luna cannot confirm whether an individual account is eligible, compliant, breached, KYC-approved, or ready for a payout. That id is the scored send only on an exclusive claim when decide runs. Flag off is F1 silence. The refuse id is not sent.

| row | old | new |
|---|---|---|
| AD319 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD320 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD321 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD322 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD323 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD324 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD325 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD326 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD327 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD328 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD329 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD330 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD331 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD332 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD333 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD334 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD335 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD336 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

The host string contains both the atom token and a pack/packs token, so kind is none. decide is not called. The scored result on both flags is the main route: no module body, not terminal silence. V12 and spread may send their own approved output. atom.bundles.en is not emitted.

| row | old | new |
|---|---|---|
| AD337 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |
| AD338 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD339 | SEND atom.bundles.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.bundles.en","contentHash":"c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

The host string contains both the atom token and a pack/packs token, so kind is none. decide is not called. The scored result on both flags is the main route: no module body, not terminal silence. V12 and spread may send their own approved output. atom.bundles.en is not emitted.

| row | old | new |
|---|---|---|
| AD340 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD341 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

The host string contains both the atom token and a pack/packs token, so kind is none. decide is not called. The scored result on both flags is the main route: no module body, not terminal silence. V12 and spread may send their own approved output. atom.bundles.en is not emitted.

| row | old | new |
|---|---|---|
| AD342 | router both-entities | flagOn none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} | flagOff none|both-entities|main-route {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-and-spread","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD343 | SEND atom.bundles.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.bundles.en","contentHash":"c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD344 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.sizes-5k-10k.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.sizes-5k-10k.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD345 | SEND atom.obsolete.sizes-5k-10k.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.sizes-5k-10k.en","contentHash":"dfc95533fcfb5d0ece5b963ad56ed3918bbf87d7bff33ebfd7441c354a9f62a2"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD346 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.house.simulated.en, atom.overview.en). The scored send, when decide runs, is only atom.house.simulated.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD347 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.1step.leverage.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD348 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Digit 0 is not rewritten, so at0m is not the token atom. kind is none, obfuscated not-a-claim. The scored result on both flags is the main route. The catalog is the 12 sendable V12 rows only. atom.1step.max-loss.en states trailing equity and is not sent. Not F1.

| row | old | new |
|---|---|---|
| AD349 | router no-atom-entity | flagOn none|obfuscated|main-route-v12-12 {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-12-sendable-only","refuseId":false} | flagOff none|obfuscated|main-route-v12-12 {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-12-sendable-only","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD350 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.phases.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.2step.phases.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD351 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

U+200B is deleted. The letters that remain are atom1step, which is not the token atom. kind is none, the same obfuscated row as AD349. The scored result is the main route, 12 sendable V12 rows only. Not an Atom id. Not F1.

| row | old | new |
|---|---|---|
| AD352 | router no-atom-entity | flagOn none|obfuscated|main-route-v12-12 {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-12-sendable-only","refuseId":false} | flagOff none|obfuscated|main-route-v12-12 {"result":"main-route","moduleBody":false,"terminalSilence":false,"catalog":"v12-12-sendable-only","refuseId":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD353 | SEND atom.1step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.news.en","contentHash":"8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD354 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD355 | ABSTAIN atom-2step-trailing | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"atom-2step-trailing","policy":null} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

atom.account-status.refuse.en states that Luna cannot confirm whether an individual account is eligible, compliant, breached, KYC-approved, or ready for a payout. That id is the scored send only on an exclusive claim when decide runs. Flag off is F1 silence. The refuse id is not sent.

| row | old | new |
|---|---|---|
| AD356 | SEND atom.account-status.refuse.en | flagOn exclusive|Atom|personal|runs {"result":"send","partId":"atom.account-status.refuse.en","contentHash":"c2c0549d9209c8dc9ba39f738d9a87a04355899da7a9a137cb87cdb450e41128"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.price-161-permanent.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.price-161-permanent.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD357 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD358 | SEND atom.overview.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.overview.en","contentHash":"d976a964056cf151c78ef3ad8acbb42e84a5adf1677259cbe77f66d632a6b632"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD359 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.funded-profitable-days.en, atom.1step.min-days.en). The scored send, when decide runs, is only atom.1step.funded-profitable-days.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD360 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.first-payout-14.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.obsolete.first-payout-14.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD361 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.phases.en, atom.obsolete.10pct-1step.en). The scored send, when decide runs, is only atom.obsolete.10pct-1step.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD362 | SEND atom.obsolete.10pct-1step.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.10pct-1step.en","contentHash":"71196e899a751cc467c2cca105b47017bf6f0d16312bab09a06c70e9e8830fc5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. decide runs when the flag is on and delivery is wired, and it abstains, so the scored public result is silence. Flag off is F1 silence. No module body either way. acceptableSet is empty.

| row | old | new |
|---|---|---|
| AD363 | ABSTAIN unresolved-policy policy.coupon-stacking | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.coupon-stacking"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD364 | ABSTAIN unresolved-policy policy.equality-50 | flagOn exclusive|Atom|general|runs|silence {"result":"silence","code":"unresolved-policy","policy":"policy.equality-50"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.price-161-permanent.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.price-161-permanent.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD365 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD366 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD367 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD368 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD369 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.price-161-permanent.en, atom.prices.list.en). The scored send, when decide runs, is only atom.obsolete.price-161-permanent.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD370 | SEND atom.obsolete.price-161-permanent.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.price-161-permanent.en","contentHash":"b778171b1b98d2d9c6c7f9fc44b74080f51543c711756a325318094ef9c1971d"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD371 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD372 | SEND atom.prices.list.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.prices.list.en","contentHash":"202c34344436aa6701413db8afb344a1cf89284b9821820aa9d033c7cd289ca5"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD373 | SEND atom.2step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.consistency.en","contentHash":"9ffaee0d2405d8ac740e277e913e4519f349e054a60128841bcfb48e346f6cd7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD374 | SEND atom.1step.consistency.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.consistency.en","contentHash":"56ffe2f069b3a536aab9a0952d5eac26266341aaff2dd58045764adc60c50982"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.news.en, atom.2step.news.en). The scored send, when decide runs, is only atom.2step.news.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD375 | SEND atom.2step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.news.en","contentHash":"06e84450ddb0ec0a4cbef21f336c99dc996da7714232adb9542501faa86eb5f4"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD376 | SEND atom.1step.news.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.news.en","contentHash":"8c2bb7076db6391614dd42befb979dc513f017f2f38d7f688e39791c7a5e02ee"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD377 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD378 | SEND atom.1step.leverage.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.leverage.en","contentHash":"2a09bb9287087955a1003d8169e684a9bbd1cd6fb776e0a59fd61ffa17960bfe"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.reward.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.2step.reward.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD379 | SEND atom.2step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.reward.en","contentHash":"07e4a76ec2cbb1009a43729c021d83b8faea717442ea80ab8d97c0614e65ba01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.reward.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.1step.reward.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD380 | SEND atom.1step.reward.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.reward.en","contentHash":"5376b1b98950d670ff0288e893908f188790ea1800f690c2cfd470db5979a0ac"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD381 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.funded-profitable-days.en, atom.1step.min-days.en). The scored send, when decide runs, is only atom.1step.funded-profitable-days.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD382 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD383 | SEND atom.1step.funded-profitable-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.funded-profitable-days.en","contentHash":"3bb567dd237aec2f6e7f78bf26441657f7ac7e845653406d27e821b2bfa51a53"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD384 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD385 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD386 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.2step.phases.en, atom.checkout.options.en). The scored send, when decide runs, is only atom.2step.phases.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD387 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD388 | SEND atom.1step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.phases.en","contentHash":"2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD389 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD390 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD391 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD392 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.obsolete.first-payout-14.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.obsolete.first-payout-14.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD393 | SEND atom.obsolete.first-payout-14.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.first-payout-14.en","contentHash":"74372a404e6772c0600c11d1045a63a07b63f3a5e0f4872b933008124efd6239"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.checkout.options.en, atom.payouts.general.en). The scored send, when decide runs, is only atom.payouts.general.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD394 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD395 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD396 | SEND atom.payouts.general.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.payouts.general.en","contentHash":"290f684b760683ca4664853c73a971abe99a109f78b946e46e0f142b5416d924"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD397 | SEND atom.bundles.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.bundles.en","contentHash":"c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD398 | SEND atom.bundles.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.bundles.en","contentHash":"c863a8cb57783b367916b550f0e308d15e8a042aca72e34a8cf7589612cac62a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD399 | SEND atom.house.eas-copy.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.eas-copy.en","contentHash":"2f7426cbca0a5a2b2efb94a8c6ce0e11b5dfa0673a3b85c953941b6a073057ae"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD400 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.house.simulated.en, atom.overview.en). The scored send, when decide runs, is only atom.house.simulated.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD401 | SEND atom.house.simulated.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.house.simulated.en","contentHash":"41fb7d88fe2826808c70a4e12f18e0fa1a4753e3daa0f489f74ce6a6280dc478"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD402 | SEND atom.2step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.min-days.en","contentHash":"de6161fd95546d9fd46a9b23159e1cda4bb84e956a1565ce60a14c1966eec5f7"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD403 | SEND atom.1step.min-days.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.min-days.en","contentHash":"4721684c627e88ffc72d5ce575edaddca8e400fcfdac644d8187602edfc5f6d6"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD404 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD405 | SEND atom.1step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.daily-loss.en","contentHash":"a227a188ff370d0c8cf2010657b210967aff76e453cddcf03c93802b19101ae1"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD406 | SEND atom.2step.daily-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.daily-loss.en","contentHash":"bac2e061b74a16c7ceb7a0b9b6ea3102a417c23d43a74fd9edb137365a69249b"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD407 | SEND atom.1step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.max-loss.en","contentHash":"78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD408 | SEND atom.2step.max-loss.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.max-loss.en","contentHash":"e0c9aa0935441852b6670411b8ae739ecc55ea8294802b0e6abd58c5cf229526"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD409 | SEND atom.2step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.2step.phases.en","contentHash":"3555c5ed0cb264c8b3cc389f9bf75a01eb6ba5c96056fd54b4bc231505e9b6c3"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |
| AD410 | SEND atom.1step.phases.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.1step.phases.en","contentHash":"2704c9287ca3a42622f3ef5b94d34def202840b5a2ef959a5dc70cb8f92061fb"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. More than one body states every asked fact and they agree, so acceptableSet stays metadata (atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en). The scored send, when decide runs, is only atom.obsolete.leverage-150-default.en. Another member is not the scored send. Flag off is F1 silence.

| row | old | new |
|---|---|---|
| AD411 | SEND atom.obsolete.leverage-150-default.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.obsolete.leverage-150-default.en","contentHash":"45e8d9947e0cf8a9c04fd6663975ab7ffc9b1ea0482e4605be6226ceb0daec01"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

Exclusive general. One covering body. The scored send, when decide runs, is that id. Flag off is F1 silence. The id is not sent while the flag is off.

| row | old | new |
|---|---|---|
| AD412 | SEND atom.checkout.options.en | flagOn exclusive|Atom|general|runs {"result":"send","partId":"atom.checkout.options.en","contentHash":"903db507cc76d732e38bc8e3579fd8419196d8297d3d972edd1160c1943f8e6a"} | flagOff exclusive|flag-off|f1-silence {"result":"f1-silence","reply":false,"note":false,"assignment":false} |

---

# Previous revisions

## Revision bce740fb

Authority: branch t742-design, commit `bce740fb6955e9fc60b3a87809b94bfb67246d7f`, `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` sha256 `fedb3bc6a7b58172ad3af4cca6f47b2504361883ed901fa407662fa3e352783b`.

The rule "two rows at or above T means ABSTAIN" is withdrawn. Where one or more approved bodies each state every asked fact and do not conflict, the gold is that set. Any member is a correct send. `decide.partId` is the deterministic pick: highest score, then smallest id. An obsolete body that restates the same fact stays in the set. Abstain only when nothing covers, or the facts conflict and are not an obsolete-versus-current split.

Row text is unchanged. Catalog bodies, ids, and sendability are unchanged.

Rows changed in this revision: 107.


atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both state the phase-1 figure. They agree, so both are acceptable. The withdrawn two-above-threshold abstain does not apply. Deterministic pick atom.checkout.options.en (highest score, then smallest id). Scores: checkout.options=0.1381, 2step.phases=0.1061.

| row | old | new |
|---|---|---|
| AD015 | ABSTAIN COVERAGE_DENIED | SEND atom.checkout.options.en acceptable [atom.2step.phases.en, atom.checkout.options.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.4087, 1step.news=0.3717.

| row | old | new |
|---|---|---|
| AD045 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.4075, 1step.news=0.3697.

| row | old | new |
|---|---|---|
| AD048 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2303, 2step.leverage=0.2285, checkout.options=0.1129.

| row | old | new |
|---|---|---|
| AD049 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.3253, 2step.leverage=0.2384, checkout.options=0.1223.

| row | old | new |
|---|---|---|
| AD050 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.2287, obsolete.leverage-150-default=0.1427, checkout.options=0.0467.

| row | old | new |
|---|---|---|
| AD051 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1689, 2step.leverage=0.1516, checkout.options=0.0879.

| row | old | new |
|---|---|---|
| AD052 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.2018, obsolete.leverage-150-default=0.1353, checkout.options=0.0341.

| row | old | new |
|---|---|---|
| AD053 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.1025, obsolete.leverage-150-default=0.0862, checkout.options=0.0770.

| row | old | new |
|---|---|---|
| AD054 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1581, checkout.options=0.0710.

| row | old | new |
|---|---|---|
| AD055 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.2291, checkout.options=0.0251.

| row | old | new |
|---|---|---|
| AD056 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.2561, checkout.options=0.1309.

| row | old | new |
|---|---|---|
| AD057 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1996, checkout.options=0.0638.

| row | old | new |
|---|---|---|
| AD058 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1053, checkout.options=0.0584.

| row | old | new |
|---|---|---|
| AD059 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.2405, checkout.options=0.1491.

| row | old | new |
|---|---|---|
| AD060 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2000, 1step.phases=0.1803.

| row | old | new |
|---|---|---|
| AD062 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2014, 1step.phases=0.1392.

| row | old | new |
|---|---|---|
| AD063 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.1step.phases.en (highest score, then smallest id). Scores: 1step.phases=0.1940, obsolete.10pct-1step=0.1674.

| row | old | new |
|---|---|---|
| AD065 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.phases.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both state that evaluation fact. They agree. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2619, 1step.min-days=0.2383.

| row | old | new |
|---|---|---|
| AD082 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.3662, 1step.min-days=0.2383.

| row | old | new |
|---|---|---|
| AD085 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.1668, 1step.min-days=0.1096.

| row | old | new |
|---|---|---|
| AD086 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.min-days.en (highest score, then smallest id). Scores: 1step.min-days=0.1736, 1step.funded-profitable-days=0.1116.

| row | old | new |
|---|---|---|
| AD087 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.min-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2644, 1step.min-days=0.1489.

| row | old | new |
|---|---|---|
| AD088 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.1560, 1step.min-days=0.1217.

| row | old | new |
|---|---|---|
| AD090 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.6218, 1step.news=0.5989.

| row | old | new |
|---|---|---|
| AD098 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.4390, 1step.news=0.4325.

| row | old | new |
|---|---|---|
| AD101 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. They agree. Deterministic pick atom.1step.leverage.en (highest score, then smallest id). Scores: 1step.leverage=0.1421, checkout.options=0.1117.

| row | old | new |
|---|---|---|
| AD108 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.leverage.en acceptable [atom.1step.leverage.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2773, checkout.options=0.0624.

| row | old | new |
|---|---|---|
| AD109 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.1000, checkout.options=0.0118.

| row | old | new |
|---|---|---|
| AD110 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2024, checkout.options=0.0853.

| row | old | new |
|---|---|---|
| AD111 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2874, checkout.options=0.0222.

| row | old | new |
|---|---|---|
| AD112 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.2175, checkout.options=0.0521.

| row | old | new |
|---|---|---|
| AD113 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.1286, checkout.options=0.1131.

| row | old | new |
|---|---|---|
| AD114 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.3376, payouts.general=0.2128.

| row | old | new |
|---|---|---|
| AD115 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "later payouts are every 14 days by default". atom.obsolete.first-payout-14.en states "Later payouts follow the purchased interval (default 14 days)". atom.checkout.options.en states "payout interval 3/7/14/21 days (default 14)". All three state the later default. They agree. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2662, payouts.general=0.2250, checkout.options=0.0655.

| row | old | new |
|---|---|---|
| AD116 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.checkout.options.en, atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list those intervals. atom.obsolete.first-payout-14.en does not list 3 and 21. Deterministic pick atom.payouts.general.en (highest score, then smallest id). Scores: payouts.general=0.2585, checkout.options=0.0857.

| row | old | new |
|---|---|---|
| AD117 | ABSTAIN COVERAGE_DENIED | SEND atom.payouts.general.en acceptable [atom.checkout.options.en, atom.payouts.general.en] |

atom.payouts.general.en states the first wait of 21 days and later payouts every 14 days by default. atom.obsolete.first-payout-14.en states both of those facts. atom.checkout.options.en does not state the first wait of 21 days. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2356, payouts.general=0.1313.

| row | old | new |
|---|---|---|
| AD122 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2310, prices.list=0.1396.

| row | old | new |
|---|---|---|
| AD124 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3390, prices.list=0.2150.

| row | old | new |
|---|---|---|
| AD129 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

The normalized text contains both the atom token and a pack/packs token. claim.kind is none. The router abstains and does not call decide. atom.bundles.en states the multi-buy offer where that is the asked fact, and that body is not emitted on this row.

| row | old | new |
|---|---|---|
| AD137 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD139 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD140 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.house.simulated.en (highest score, then smallest id). Scores: house.simulated=0.3201, overview.en=0.1445.

| row | old | new |
|---|---|---|
| AD148 | ABSTAIN COVERAGE_DENIED | SEND atom.house.simulated.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.overview.en (highest score, then smallest id). Scores: overview.en=0.1062, house.simulated=0.0880.

| row | old | new |
|---|---|---|
| AD152 | ABSTAIN COVERAGE_DENIED | SEND atom.overview.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.3204, 1step.phases=0.2833.

| row | old | new |
|---|---|---|
| AD154 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2075, 1step.phases=0.0429.

| row | old | new |
|---|---|---|
| AD155 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.1step.phases.en (highest score, then smallest id). Scores: 1step.phases=0.0819, obsolete.10pct-1step=0.0627.

| row | old | new |
|---|---|---|
| AD157 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.phases.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.2584, 1step.phases=0.1452.

| row | old | new |
|---|---|---|
| AD158 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.3668, payouts.general=0.1330.

| row | old | new |
|---|---|---|
| AD160 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2087, payouts.general=0.1011.

| row | old | new |
|---|---|---|
| AD161 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.3220, payouts.general=0.1995.

| row | old | new |
|---|---|---|
| AD162 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.1492, payouts.general=0.0817.

| row | old | new |
|---|---|---|
| AD163 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.0958, payouts.general=0.0846.

| row | old | new |
|---|---|---|
| AD164 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.2826, payouts.general=0.0808.

| row | old | new |
|---|---|---|
| AD165 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.3042, 2step.leverage=0.2397, 1step.leverage=0.2263, checkout.options=0.1471.

| row | old | new |
|---|---|---|
| AD166 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.1step.leverage.en (highest score, then smallest id). Scores: 1step.leverage=0.1658, 2step.leverage=0.1501, checkout.options=0.1002, obsolete.leverage-150-default=0.0784.

| row | old | new |
|---|---|---|
| AD167 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.leverage.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30" and that 2-Step can pick 1:50 or 1:100. atom.checkout.options.en states the 2-Step leverage default 1:30. atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and that 1:50 or 1:100 is a 2-Step checkout option, not the universal default. They agree. atom.1step.leverage.en does not state the 2-Step default. Deterministic pick atom.2step.leverage.en (highest score, then smallest id). Scores: 2step.leverage=0.2445, obsolete.leverage-150-default=0.1041, checkout.options=0.0823.

| row | old | new |
|---|---|---|
| AD168 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.leverage.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.0619, 1step.leverage=0.0440, 2step.leverage=0.0378, checkout.options=0.0359.

| row | old | new |
|---|---|---|
| AD169 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1857, 2step.leverage=0.1188, 1step.leverage=0.1131, checkout.options=0.0792.

| row | old | new |
|---|---|---|
| AD170 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30" and that 2-Step can pick 1:50 or 1:100. atom.checkout.options.en states the 2-Step leverage default 1:30. atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and that 1:50 or 1:100 is a 2-Step checkout option, not the universal default. They agree. atom.1step.leverage.en does not state the 2-Step default. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2615, 2step.leverage=0.1532, checkout.options=0.0743.

| row | old | new |
|---|---|---|
| AD171 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2108, 1step.leverage=0.1626, checkout.options=0.0960, 2step.leverage=0.0844.

| row | old | new |
|---|---|---|
| AD172 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3185, prices.list=0.2350.

| row | old | new |
|---|---|---|
| AD173 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2334, prices.list=0.1793.

| row | old | new |
|---|---|---|
| AD174 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2306, prices.list=0.1982.

| row | old | new |
|---|---|---|
| AD175 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3635, prices.list=0.2094.

| row | old | new |
|---|---|---|
| AD176 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2340, prices.list=0.1416.

| row | old | new |
|---|---|---|
| AD177 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Same fact. Both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.3185, prices.list=0.2364.

| row | old | new |
|---|---|---|
| AD178 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2435, prices.list=0.1250.

| row | old | new |
|---|---|---|
| AD179 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2823, prices.list=0.1083.

| row | old | new |
|---|---|---|
| AD180 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2333, prices.list=0.1650.

| row | old | new |
|---|---|---|
| AD181 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.3600, prices.list=0.1206.

| row | old | new |
|---|---|---|
| AD182 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.2919, prices.list=0.1782.

| row | old | new |
|---|---|---|
| AD183 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.1876, prices.list=0.0141.

| row | old | new |
|---|---|---|
| AD184 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.payouts.general.en states "Default reward share is 80%". atom.2step.reward.en and atom.1step.reward.en each state "the default reward share is 80%". atom.checkout.options.en states reward default 80% for both products. The question asks only that default. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.3132, 2step.reward=0.2977, payouts.general=0.1402, checkout.options=0.0962.

| row | old | new |
|---|---|---|
| AD185 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.2step.reward.en, atom.checkout.options.en, atom.payouts.general.en] |

atom.payouts.general.en states "Default reward share is 80%". atom.2step.reward.en and atom.1step.reward.en each state "the default reward share is 80%". atom.checkout.options.en states reward default 80% for both products. The question asks only that default. They agree. Deterministic pick atom.payouts.general.en (highest score, then smallest id). Scores: payouts.general=0.1119, checkout.options=0.0721, 1step.reward=0.0612, 2step.reward=0.0578.

| row | old | new |
|---|---|---|
| AD186 | ABSTAIN COVERAGE_DENIED | SEND atom.payouts.general.en acceptable [atom.1step.reward.en, atom.2step.reward.en, atom.checkout.options.en, atom.payouts.general.en] |

The normalized text contains both the atom token and a pack/packs token. claim.kind is none. The router abstains and does not call decide. atom.bundles.en states the multi-buy offer where that is the asked fact, and that body is not emitted on this row.

| row | old | new |
|---|---|---|
| AD194 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD229 | claim none; ABSTAIN COVERAGE_DENIED | claim none; router abstain both-entities; decide not called |
| AD337 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD338 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD340 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |
| AD342 | claim none; SEND atom.bundles.en | claim none; router abstain both-entities; decide not called |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Same facts. Both stay. Deterministic pick atom.obsolete.sizes-5k-10k.en (highest score, then smallest id). Scores: obsolete.sizes-5k-10k=0.3016, prices.list=0.1673.

| row | old | new |
|---|---|---|
| AD345 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.sizes-5k-10k.en acceptable [atom.obsolete.sizes-5k-10k.en, atom.prices.list.en] |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.house.simulated.en (highest score, then smallest id). Scores: house.simulated=0.1623, overview.en=0.1520.

| row | old | new |
|---|---|---|
| AD347 | ABSTAIN COVERAGE_DENIED | SEND atom.house.simulated.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. They agree. Deterministic pick atom.1step.leverage.en (highest score, then smallest id). Scores: 1step.leverage=0.2356, checkout.options=0.1206.

| row | old | new |
|---|---|---|
| AD348 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.leverage.en acceptable [atom.1step.leverage.en, atom.checkout.options.en] |

Digit 0 is not folded, so at0m is not the atom token. claim.kind stays none. atom.1step.max-loss.en states "max loss is 6% trailing equity" and is not the end-to-end gold. decide is not called.

| row | old | new |
|---|---|---|
| AD349 | claim none; SEND atom.1step.max-loss.en | claim none; router abstain no-atom-entity; no module SEND |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both state the phase-1 figure. They agree, so both are acceptable. The withdrawn two-above-threshold abstain does not apply. Deterministic pick atom.2step.phases.en (highest score, then smallest id). Scores: 2step.phases=0.2321, checkout.options=0.1011.

| row | old | new |
|---|---|---|
| AD351 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.phases.en acceptable [atom.2step.phases.en, atom.checkout.options.en] |

The zero-width character is a format character and is deleted, not turned into a space. The glued form atom1step is not the token atom. claim.kind is none. atom.1step.daily-loss.en states the asked daily-loss fact and is not the end-to-end gold. decide is not called.

| row | old | new |
|---|---|---|
| AD352 | claim exclusive; SEND atom.1step.daily-loss.en | claim none; router abstain no-atom-entity; no module SEND |

Spaced single letters join to the token atom. claim is exclusive. atom.1step.news.en states "On Atom 1-Step, news trading is allowed during evaluation." That is the only covering body. Flag off, the end-to-end gold is F1 silence. Flag on, the module gold is that id.

| row | old | new |
|---|---|---|
| AD353 | claim none; SEND atom.1step.news.en | claim exclusive atom; SEND atom.1step.news.en; flag off f1-silence |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.2572, 2step.leverage=0.1242, 1step.leverage=0.1066, checkout.options=0.0629.

| row | old | new |
|---|---|---|
| AD354 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2789, prices.list=0.1734.

| row | old | new |
|---|---|---|
| AD357 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1589, 2step.leverage=0.1356, checkout.options=0.1145.

| row | old | new |
|---|---|---|
| AD359 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2589, 1step.min-days=0.2231.

| row | old | new |
|---|---|---|
| AD360 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Same fact. The obsolete row restates it, so both stay. Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.4253, payouts.general=0.1367.

| row | old | new |
|---|---|---|
| AD361 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Same fact, including the obsolete restatement. Not a conflict, so both stay. Deterministic pick atom.obsolete.10pct-1step.en (highest score, then smallest id). Scores: obsolete.10pct-1step=0.1892, 1step.phases=0.1858.

| row | old | new |
|---|---|---|
| AD362 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.10pct-1step.en acceptable [atom.1step.phases.en, atom.obsolete.10pct-1step.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.2669, prices.list=0.1654.

| row | old | new |
|---|---|---|
| AD365 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Same list figures. The obsolete row restates them, so both stay. Deterministic pick atom.obsolete.price-161-permanent.en (highest score, then smallest id). Scores: obsolete.price-161-permanent=0.1492, prices.list=0.0884.

| row | old | new |
|---|---|---|
| AD370 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.price-161-permanent.en acceptable [atom.obsolete.price-161-permanent.en, atom.prices.list.en] |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. They agree. Deterministic pick atom.2step.news.en (highest score, then smallest id). Scores: 2step.news=0.5755, 1step.news=0.5399.

| row | old | new |
|---|---|---|
| AD375 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.news.en acceptable [atom.1step.news.en, atom.2step.news.en] |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the 2-Step menu. They agree. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1617, 2step.leverage=0.1394, checkout.options=0.0495.

| row | old | new |
|---|---|---|
| AD377 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu. They agree. Deterministic pick atom.2step.reward.en (highest score, then smallest id). Scores: 2step.reward=0.1779, checkout.options=0.0556.

| row | old | new |
|---|---|---|
| AD379 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.reward.en acceptable [atom.2step.reward.en, atom.checkout.options.en] |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu. They agree. Deterministic pick atom.1step.reward.en (highest score, then smallest id). Scores: 1step.reward=0.1507, checkout.options=0.0438.

| row | old | new |
|---|---|---|
| AD380 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.reward.en acceptable [atom.1step.reward.en, atom.checkout.options.en] |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both state that evaluation fact. They agree. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.4398, 1step.min-days=0.2874.

| row | old | new |
|---|---|---|
| AD382 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state that gate. They agree. The question does not ask the $500 example, which only the min-days body states. Deterministic pick atom.1step.funded-profitable-days.en (highest score, then smallest id). Scores: 1step.funded-profitable-days=0.2313, 1step.min-days=0.1830.

| row | old | new |
|---|---|---|
| AD383 | ABSTAIN COVERAGE_DENIED | SEND atom.1step.funded-profitable-days.en acceptable [atom.1step.funded-profitable-days.en, atom.1step.min-days.en] |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both state the phase-1 figure. They agree, so both are acceptable. The withdrawn two-above-threshold abstain does not apply. Deterministic pick atom.2step.phases.en (highest score, then smallest id). Scores: 2step.phases=0.2206, checkout.options=0.0667.

| row | old | new |
|---|---|---|
| AD387 | ABSTAIN COVERAGE_DENIED | SEND atom.2step.phases.en acceptable [atom.2step.phases.en, atom.checkout.options.en] |

atom.payouts.general.en states the first wait of 21 days and later payouts every 14 days by default. atom.obsolete.first-payout-14.en states both. atom.checkout.options.en states the interval default of 14 days and does not state the first wait, so it does not cover "distinct from the first wait". Deterministic pick atom.obsolete.first-payout-14.en (highest score, then smallest id). Scores: obsolete.first-payout-14=0.4178, payouts.general=0.2203.

| row | old | new |
|---|---|---|
| AD393 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.first-payout-14.en acceptable [atom.obsolete.first-payout-14.en, atom.payouts.general.en] |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list those intervals. atom.obsolete.first-payout-14.en does not list 3 and 21. Deterministic pick atom.payouts.general.en (highest score, then smallest id). Scores: payouts.general=0.1464, checkout.options=0.1174.

| row | old | new |
|---|---|---|
| AD394 | ABSTAIN COVERAGE_DENIED | SEND atom.payouts.general.en acceptable [atom.checkout.options.en, atom.payouts.general.en] |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. They agree. The real-capital and guaranteed-reward sentences are not asked. Deterministic pick atom.house.simulated.en (highest score, then smallest id). Scores: house.simulated=0.2728, overview.en=0.2371.

| row | old | new |
|---|---|---|
| AD401 | ABSTAIN COVERAGE_DENIED | SEND atom.house.simulated.en acceptable [atom.house.simulated.en, atom.overview.en] |

atom.2step.leverage.en states "Atom leverage defaults to 1:30". atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.checkout.options.en states leverage "(default 1:30)". atom.1step.leverage.en states "the published default of 1:30". All four state that default. They agree. The obsolete row is a restatement, not a conflicting fact. Deterministic pick atom.obsolete.leverage-150-default.en (highest score, then smallest id). Scores: obsolete.leverage-150-default=0.1786, 1step.leverage=0.1056, 2step.leverage=0.1033, checkout.options=0.0706.

| row | old | new |
|---|---|---|
| AD411 | ABSTAIN COVERAGE_DENIED | SEND atom.obsolete.leverage-150-default.en acceptable [atom.1step.leverage.en, atom.2step.leverage.en, atom.checkout.options.en, atom.obsolete.leverage-150-default.en] |

---

# Previous revision (3c173899)

Authority: branch t742-design, commit 31b07389e4fef10d433c306ed7de2850f254c468, `staging-repair-t739/docs/T742_DESIGN_AND_ACCEPTANCE.md` sha256 `0aeb4ea6e1bac8366a0b45b502c9d3eeab0d5be1b7b63209bbf7d9f08c5fc1b0`.

Gold rule used: one approved body covers every intent, judged from that body's text, so the label is that id. Otherwise ABSTAIN. Two bodies that each state every asked fact are ABSTAIN `COVERAGE_DENIED`, not the more specific row. A question whose single approved body already covers it is not moved to ABSTAIN.

Row text is unchanged. Catalog bodies, ids, and sendability are unchanged. No new catalog row.

## Decision changes (99)

These rows change the gold id, or change between SEND and ABSTAIN.


atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both bodies state the phase-1 figure the question asks. Neither is kept by a specificity tie-break.

| row | old | new |
|---|---|---|
| AD015 | SEND atom.2step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. The challenge-phase sentence is not asked, so the product news row is not a single covering body.

| row | old | new |
|---|---|---|
| AD045 | SEND atom.2step.news.en | ABSTAIN COVERAGE_DENIED |
| AD048 | SEND atom.2step.news.en | ABSTAIN COVERAGE_DENIED |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the menu the question asks.

| row | old | new |
|---|---|---|
| AD049 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD050 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD051 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD052 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD053 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |
| AD054 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD055 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD056 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD057 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD058 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD059 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD060 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Both cover a percent-only ask. The obsolete body is not more specific under the new rule.

| row | old | new |
|---|---|---|
| AD062 | SEND atom.1step.phases.en | ABSTAIN COVERAGE_DENIED |
| AD063 | SEND atom.1step.phases.en | ABSTAIN COVERAGE_DENIED |
| AD065 | SEND atom.1step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both cover an evaluation profitable-day ask. The question does not ask the trading-day or $500 facts that only the min-days body states.

| row | old | new |
|---|---|---|
| AD082 | SEND atom.1step.min-days.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD085 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |
| AD086 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |
| AD087 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |
| AD088 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

The question identifies a day of at least five hundred dollars on 100k. atom.1step.min-days.en states "Example (100K): a day counts as profitable when you close it at least $500 up". atom.1step.funded-profitable-days.en states the 0.5% rule and does not state $500. One body covers the dollar fact.

| row | old | new |
|---|---|---|
| AD089 | SEND atom.1step.funded-profitable-days.en | SEND atom.1step.min-days.en |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD090 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. The challenge-phase sentence is not asked, so the product news row is not a single covering body.

| row | old | new |
|---|---|---|
| AD098 | SEND atom.1step.news.en | ABSTAIN COVERAGE_DENIED |
| AD101 | SEND atom.1step.news.en | ABSTAIN COVERAGE_DENIED |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed at the published default of 1:30". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. The question does not ask a fact that only one of those sentences contains.

| row | old | new |
|---|---|---|
| AD108 | SEND atom.1step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD109 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD110 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD111 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD112 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD113 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |
| AD114 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Both cover a first-wait ask. The obsolete body does not add a fact this question requires.

| row | old | new |
|---|---|---|
| AD115 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "later payouts are every 14 days by default". atom.obsolete.first-payout-14.en states "Later payouts follow the purchased interval (default 14 days)". atom.checkout.options.en states "payout interval 3/7/14/21 days (default 14)". More than one body states the later default of 14 days.

| row | old | new |
|---|---|---|
| AD116 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list the intervals the question asks. atom.obsolete.first-payout-14.en does not list 3 and 21.

| row | old | new |
|---|---|---|
| AD117 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states the first wait of 21 days and later payouts every 14 days by default. atom.obsolete.first-payout-14.en states both of those facts. The question asks only that pair.

| row | old | new |
|---|---|---|
| AD122 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Both state the 100k list figures the question asks.

| row | old | new |
|---|---|---|
| AD124 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |
| AD129 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. It does not ask the real-capital or guaranteed-reward sentences, which only the house body states.

| row | old | new |
|---|---|---|
| AD148 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |
| AD152 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Both cover a percent-only ask. The obsolete body is not more specific under the new rule.

| row | old | new |
|---|---|---|
| AD154 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |
| AD155 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |
| AD157 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |
| AD158 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Both cover a first-wait ask. The obsolete body does not add a fact this question requires.

| row | old | new |
|---|---|---|
| AD160 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD161 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD162 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD163 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD164 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |
| AD165 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |

atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.2step.leverage.en states "Atom leverage defaults to 1:30". Both cover a default-leverage ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD166 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD167 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD168 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD169 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD170 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD171 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |
| AD172 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "Promotional figures such as a permanent $161 100K price are not list prices." atom.obsolete.price-161-permanent.en states "A $161 figure from older marketing is promotional, not a permanent list price." Both cover a permanent-$161 ask.

| row | old | new |
|---|---|---|
| AD173 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD174 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD175 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD176 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD177 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |
| AD178 | SEND atom.obsolete.price-161-permanent.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Both cover a size-list or 5k/10k ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD179 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD180 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD181 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD182 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD183 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |
| AD184 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "Default reward share is 80%". atom.2step.reward.en and atom.1step.reward.en each state "the default reward share is 80%". atom.checkout.options.en states reward default 80% for both products. The question asks only for that default.

| row | old | new |
|---|---|---|
| AD185 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |
| AD186 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.2step.max-loss.en states "The floor is your starting balance minus 10% and never moves." The question asks whether that floor chases, ratchets, or lifts, and the text does not contain "trailing", so the 2-Step trailing veto does not apply. No other sendable body states this 2-Step floor.

| row | old | new |
|---|---|---|
| AD202 | ABSTAIN abstain:2step-trailing-uncovered | SEND atom.2step.max-loss.en |
| AD205 | ABSTAIN abstain:2step-trailing-uncovered | SEND atom.2step.max-loss.en |
| AD210 | ABSTAIN abstain:2step-trailing-uncovered | SEND atom.2step.max-loss.en |

atom.prices.list.en states "Do not treat 5K or 10K Atom sizes as available unless the live catalog shows them" and lists 7K, 25K, 50K, 100K, and 200K. atom.obsolete.sizes-5k-10k.en states "The published Elite Atom catalog lists 7K, 25K, 50K, 100K, and 200K" and that 5K and 10K "are not advertised unless the live catalog confirms them." Both cover a size-list or 5k/10k ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD345 | SEND atom.obsolete.sizes-5k-10k.en | ABSTAIN COVERAGE_DENIED |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. It does not ask the real-capital or guaranteed-reward sentences, which only the house body states.

| row | old | new |
|---|---|---|
| AD347 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |

atom.1step.leverage.en states "Atom 1-Step leverage is fixed at the published default of 1:30". atom.checkout.options.en states "Atom 1-Step — max loss, target, leverage and scalping fixed". Both state that 1-Step leverage is fixed. The question does not ask a fact that only one of those sentences contains.

| row | old | new |
|---|---|---|
| AD348 | SEND atom.1step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both bodies state the phase-1 figure the question asks. Neither is kept by a specificity tie-break.

| row | old | new |
|---|---|---|
| AD351 | SEND atom.2step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.2step.leverage.en states "Atom leverage defaults to 1:30". Both cover a default-leverage ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD354 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Both state the 100k list figures the question asks.

| row | old | new |
|---|---|---|
| AD357 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the menu the question asks.

| row | old | new |
|---|---|---|
| AD359 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD360 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "first payout is 21 days after the funded account is created". atom.obsolete.first-payout-14.en states "the first payout wait is 21 days after funded account creation, not 14 days". Both cover a first-wait ask. The obsolete body does not add a fact this question requires.

| row | old | new |
|---|---|---|
| AD361 | SEND atom.obsolete.first-payout-14.en | ABSTAIN COVERAGE_DENIED |

atom.1step.phases.en states "The evaluation profit target is 8% (not 10%)". atom.obsolete.10pct-1step.en states "Atom 1-Step evaluation profit target is 8%, not 10%". Both cover a percent-only ask. The obsolete body is not more specific under the new rule.

| row | old | new |
|---|---|---|
| AD362 | SEND atom.obsolete.10pct-1step.en | ABSTAIN COVERAGE_DENIED |

atom.prices.list.en states "100K $215/$289". atom.obsolete.price-161-permanent.en states "The Atom 100K list prices are $215 (2-Step) and $289 (1-Step)". Both state the 100k list figures the question asks.

| row | old | new |
|---|---|---|
| AD365 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |
| AD370 | SEND atom.prices.list.en | ABSTAIN COVERAGE_DENIED |

atom.1step.news.en and atom.2step.news.en both state "On funded Atom accounts, trading high-impact news is not allowed." The question asks only that funded fact. The challenge-phase sentence is not asked, so the product news row is not a single covering body.

| row | old | new |
|---|---|---|
| AD375 | SEND atom.2step.news.en | ABSTAIN COVERAGE_DENIED |

atom.2step.leverage.en states "you can pick higher leverage (1:50 or 1:100) at checkout". atom.checkout.options.en states "leverage 1:30/1:50/1:100 (default 1:30)". atom.obsolete.leverage-150-default.en states "1:50 or 1:100 is an Atom 2-Step checkout option". All three state the menu the question asks.

| row | old | new |
|---|---|---|
| AD377 | SEND atom.2step.leverage.en | ABSTAIN COVERAGE_DENIED |

atom.2step.reward.en states "Atom 2-Step options include 60%, 70%, 80%, or 95%". atom.checkout.options.en states "reward 60%/70%/80%/95% (default 80%)" for Atom 2-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD379 | SEND atom.2step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.1step.reward.en states "Atom 1-Step options include 70%, 80%, or 100%". atom.checkout.options.en states "reward 70%/80%/100% (default 80%)" for Atom 1-Step. Both state the menu.

| row | old | new |
|---|---|---|
| AD380 | SEND atom.1step.reward.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "no minimum profitable days in evaluation". atom.1step.funded-profitable-days.en states "Evaluation has no minimum profitable days". Both cover an evaluation profitable-day ask. The question does not ask the trading-day or $500 facts that only the min-days body states.

| row | old | new |
|---|---|---|
| AD382 | SEND atom.1step.min-days.en | ABSTAIN COVERAGE_DENIED |

atom.1step.min-days.en states "Only on funded Atom 1-Step you need 5 profitable days of at least 0.5% of the starting balance before each payout". atom.1step.funded-profitable-days.en states "before each payout you need 5 profitable days since the last payout, each at least 0.5% of the starting account size". Both state the funded gate the question asks. The $500 example is not asked.

| row | old | new |
|---|---|---|
| AD383 | SEND atom.1step.funded-profitable-days.en | ABSTAIN COVERAGE_DENIED |

atom.2step.phases.en states "Phase 1 profit target is 8%". atom.checkout.options.en states "Phase 1 target 6%/7%/8%/10%/12% (default 8%)". Both bodies state the phase-1 figure the question asks. Neither is kept by a specificity tie-break.

| row | old | new |
|---|---|---|
| AD387 | SEND atom.2step.phases.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states "later payouts are every 14 days by default". atom.obsolete.first-payout-14.en states "Later payouts follow the purchased interval (default 14 days)". atom.checkout.options.en states "payout interval 3/7/14/21 days (default 14)". More than one body states the later default of 14 days.

| row | old | new |
|---|---|---|
| AD393 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.payouts.general.en states the purchased interval "3, 7, 14, or 21 days". atom.checkout.options.en states "payout interval 3/7/14/21 days". Both list the intervals the question asks. atom.obsolete.first-payout-14.en does not list 3 and 21.

| row | old | new |
|---|---|---|
| AD394 | SEND atom.payouts.general.en | ABSTAIN COVERAGE_DENIED |

atom.overview.en and atom.house.simulated.en both state "All Elite Atom accounts, including funded accounts, are simulated trading accounts." The question asks only that fact. It does not ask the real-capital or guaranteed-reward sentences, which only the house body states.

| row | old | new |
|---|---|---|
| AD401 | SEND atom.house.simulated.en | ABSTAIN COVERAGE_DENIED |

atom.obsolete.leverage-150-default.en states "Atom default leverage is 1:30" and does not contain "150". atom.2step.leverage.en states "Atom leverage defaults to 1:30". Both cover a default-leverage ask. The old tie-break preferred the obsolete id.

| row | old | new |
|---|---|---|
| AD411 | SEND atom.obsolete.leverage-150-default.en | ABSTAIN COVERAGE_DENIED |

## Representation only (135)

The abstain-versus-send decision is the same. The code, the policy id, or the action name changes to the contract. Refuse rows are SEND of `atom.account-status.refuse.en` because there is no PERSONAL action. The partId on those rows does not change.


The ask is a 2-Step trailing mechanism. atom.2step.max-loss.en states "max loss is 10% static" and "the floor ... never moves" and does not state trailing. atom.1step.max-loss.en states "max loss is 6% trailing equity" on Atom 1-Step and does not cover a 2-Step trailing ask. Code is atom-2step-trailing.

| row | old | new |
|---|---|---|
| AD201 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD203 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD204 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD206 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD207 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD208 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD209 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD211 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |
| AD212 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |

More than one intent, and no single approved body states every intent. Code is COVERAGE_DENIED.

| row | old | new |
|---|---|---|
| AD215 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD216 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD217 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD218 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD219 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD220 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD221 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD222 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD223 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD224 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD225 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD226 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD227 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD228 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD229 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD230 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD231 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD232 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD233 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD234 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |

atom.account-status.refuse.en states that Luna cannot confirm an individual account. It does not state the daily-loss rule. The daily-loss body does not state personal status. Neither body covers both intents. Code is COVERAGE_DENIED, not a SEND of the refuse id.

| row | old | new |
|---|---|---|
| AD235 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |

More than one intent, and no single approved body states every intent. Code is COVERAGE_DENIED.

| row | old | new |
|---|---|---|
| AD236 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |
| AD237 | ABSTAIN abstain:multi-intent | ABSTAIN COVERAGE_DENIED |

No sendable body states which size to buy. Code unresolved-policy, policy policy.sku.

| row | old | new |
|---|---|---|
| AD238 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |

Clarification stays an abstain. atom.handoff.unverified.en says a teammate can help and is a handoff suggestion. The registry does not name that id as a clarification partId, so it is not a SEND. Code is atom-clarification.

| row | old | new |
|---|---|---|
| AD239 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD240 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD241 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD242 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD243 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD244 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD245 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD246 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD247 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD248 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD249 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD250 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD251 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD252 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD253 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |
| AD254 | ABSTAIN abstain:clarification-unapproved | ABSTAIN atom-clarification |

No sendable body states the asked fact. Code is COVERAGE_DENIED.

| row | old | new |
|---|---|---|
| AD255 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD256 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD257 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD258 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD259 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD260 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD261 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD262 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD263 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD264 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD265 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD266 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD267 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD268 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD269 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |
| AD270 | ABSTAIN abstain:no-covering-body | ABSTAIN COVERAGE_DENIED |

Unresolved fee-refund ask. atom.prices.list.en states list prices and atom.payouts.general.en states payout timing and the 3% cap. Neither states a fee-refund outcome. Code unresolved-policy, policy policy.fee-refunds.

| row | old | new |
|---|---|---|
| AD271 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD272 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD273 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD274 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD275 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD276 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD277 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |
| AD278 | ABSTAIN unresolved:fee-refund | ABSTAIN unresolved-policy policy.fee-refunds |

atom.1step.consistency.en and atom.2step.consistency.en state that the best day must be less than 50%. They do not state the exactly-50% case. atom.consistency.boundary.en is not sendable. Code unresolved-policy, policy policy.equality-50.

| row | old | new |
|---|---|---|
| AD279 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD280 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD281 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD282 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD283 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD284 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD285 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |
| AD286 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |

atom.1step.news.en and atom.2step.news.en state whether high-impact news is allowed. They do not state a minute window or an instrument list. atom.news.minutes.unverified.en is not sendable. Code unresolved-policy, policy policy.news-minutes.

| row | old | new |
|---|---|---|
| AD287 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD288 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD289 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD290 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD291 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD292 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD293 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |
| AD294 | ABSTAIN unresolved:news-minutes | ABSTAIN unresolved-policy policy.news-minutes |

No sendable body states which size to buy. Code unresolved-policy, policy policy.sku.

| row | old | new |
|---|---|---|
| AD295 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD296 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD297 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD298 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD299 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD300 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD301 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |
| AD302 | ABSTAIN unresolved:checkout-sku | ABSTAIN unresolved-policy policy.sku |

The turn is an English request to translate. It is not a non-English turn, so it is not left off the module. No sendable body is a translation. Code unresolved-policy, policy policy.translations.

| row | old | new |
|---|---|---|
| AD303 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD304 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD305 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD306 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD307 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD308 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD309 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |
| AD310 | ABSTAIN unresolved:translation | ABSTAIN unresolved-policy policy.translations |

atom.bundles.en states "Verify current eligibility and stacking on the live checkout" and does not state whether two promo codes combine. Code unresolved-policy, policy policy.coupon-stacking.

| row | old | new |
|---|---|---|
| AD311 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD312 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD313 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD314 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD315 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD316 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD317 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |
| AD318 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |

atom.account-status.refuse.en states that Luna cannot confirm whether an individual account is eligible, compliant, breached, KYC-approved, or ready for a payout. decide is SEND of that id. There is no PERSONAL action.

| row | old | new |
|---|---|---|
| AD319 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD320 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD321 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD322 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD323 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD324 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD325 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD326 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD327 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD328 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD329 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD330 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD331 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD332 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD333 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD334 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD335 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |
| AD336 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |

The ask is a 2-Step trailing mechanism. atom.2step.max-loss.en states "max loss is 10% static" and "the floor ... never moves" and does not state trailing. atom.1step.max-loss.en states "max loss is 6% trailing equity" on Atom 1-Step and does not cover a 2-Step trailing ask. Code is atom-2step-trailing.

| row | old | new |
|---|---|---|
| AD355 | ABSTAIN abstain:2step-trailing-uncovered | ABSTAIN atom-2step-trailing |

atom.account-status.refuse.en states that Luna cannot confirm whether an individual account is eligible, compliant, breached, KYC-approved, or ready for a payout. decide is SEND of that id. There is no PERSONAL action.

| row | old | new |
|---|---|---|
| AD356 | REFUSE atom.account-status.refuse.en | SEND atom.account-status.refuse.en |

atom.bundles.en states "Verify current eligibility and stacking on the live checkout" and does not state whether two promo codes combine. Code unresolved-policy, policy policy.coupon-stacking.

| row | old | new |
|---|---|---|
| AD363 | ABSTAIN unresolved:coupon-stacking | ABSTAIN unresolved-policy policy.coupon-stacking |

atom.1step.consistency.en and atom.2step.consistency.en state that the best day must be less than 50%. They do not state the exactly-50% case. atom.consistency.boundary.en is not sendable. Code unresolved-policy, policy policy.equality-50.

| row | old | new |
|---|---|---|
| AD364 | ABSTAIN unresolved:consistency-equality | ABSTAIN unresolved-policy policy.equality-50 |

## Unchanged answer ids

178 rows keep the same sendable id. Each of those asks is covered by that one body, including 1-Step trailing and trailing with no product named, which stay `atom.1step.max-loss.en` (`78e0fafd4eac93690529409335f3cd8a0f72c645f7dadd2e4e97cd57f27055cc`) because that body states trailing equity and no other sendable Atom body does.
