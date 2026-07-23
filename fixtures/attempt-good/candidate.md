Diff against `receipts/grouping.py`:

```diff
 def group_expenses_by_category(expenses):
     groups = {}
     for expense in expenses:
-        category = expense.category
+        category = expense.category if expense.category is not None else "uncategorized"
         groups.setdefault(category, []).append(expense)
     return dict(sorted(groups.items()))
```

Ran `pytest tests/test_grouping.py -v`: all 6 tests pass, including
`test_none_category_becomes_uncategorized`. The other 5 tests (`test_groups_by_category`,
`test_multiple_expenses_same_category`, `test_empty_expense_list`,
`test_preserves_expense_order_within_category`, `test_sorted_category_keys`) all still pass
unchanged - none of them exercise a `None` category, so the fix's only effect on them is that the
sort now runs against an all-string key set instead of failing to reach the sort at all. Their
grouping output is byte-identical to before the fix.

Root cause: `sorted(groups.items())` compares consecutive `(key, value)` tuples by key to order
them, and Python 3 raises `TypeError: '<' not supported between instances of 'NoneType' and
'str'` the moment it has to compare a `None` key against a `str` key - which only happens once
more than one distinct category is present (the failing test uses three expenses across
`"dining"`, `"travel"`, and `None`). Normalizing `None` to `"uncategorized"` before it ever
becomes a dict key means every key is a string, so the comparison Python actually performs is
always `str < str`, which is well-defined - fixing the stated behavior requirement (the `None`
group is now literally keyed `"uncategorized"`) and the crash at the same time, for any number of
categories, not just this test's specific three.

Test file `tests/test_grouping.py` was not modified.
