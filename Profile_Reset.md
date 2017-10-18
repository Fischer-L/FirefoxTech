# Profile Reset(Refresh)

## Simple reset with profile migration
- `$ <FF_FOLDER>/firefox --reset-profile` (On Windows -reset-profile)
  - `SelectProfile` @ nsAppRunner.cpp
    ```cpp
    ar = CheckArg("reset-profile", true);
    if (ar == ARG_BAD) {
      PR_fprintf(PR_STDERR, "Error: argument --reset-profile is invalid when argument --osint is specified\n");
      return NS_ERROR_FAILURE;
    }
    if (ar == ARG_FOUND) {
      gDoProfileReset = true;
    }
    ```


