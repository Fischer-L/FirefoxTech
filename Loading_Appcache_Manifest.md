## The flow of loading appcache from html element's manifest attribute

A: nsXMLContentSink::SetDocElement(int32_t aNameSpaceID, nsIAtom* aTagName, nsIContent *aContent)
  ```cpp
    if (aTagName == nsGkAtoms::html &&
        aNameSpaceID == kNameSpaceID_XHTML) {
      ProcessOfflineManifest(aContent); // Go to [B-1]
    }
  ```

B-1: nsContentSink::ProcessOfflineManifest(nsIContent *aElement)
  ```cpp
    // Check for a manifest= attribute.
    nsAutoString manifestSpec;
    aElement->GetAttr(kNameSpaceID_None, nsGkAtoms::manifest, manifestSpec); // Go to [C]
    ProcessOfflineManifest(manifestSpec);
  ```

C: nsIContent::GetAttr(int32_t aNameSpaceID, nsIAtom* aName, nsAString& aResult)
  ```cpp
    if (IsElement()) {
      return AsElement()->GetAttr(aNameSpaceID, aName, aResult); // Go to [D]
    }
  ```

D: Element::GetAttr(int32_t aNameSpaceID, nsIAtom* aName, nsAString& aResult)
  ```cpp
    DOMString str;
    bool haveAttr = GetAttr(aNameSpaceID, aName, str); // Go to [E]
    str.ToString(aResult);
    return haveAttr;
  ```

E: inline bool GetAttr(int32_t aNameSpaceID, nsIAtom* aName, DOMString& aResult) @ Element.h
  ```cpp
    const nsAttrValue* val = mAttrsAndChildren.GetAttr(aName, aNameSpaceID); // Go to [F]
    if (val) {
      val->ToString(aResult);
      return true;
    }
  ```

F: nsAttrAndChildArray::GetAttr(nsIAtom* aLocalName, int32_t aNamespaceID)
  ```cpp
    // Below would retrieve value of nsGkAtoms::manifest (manifest attribute),
    // then returns result all the way back to [B-1]
    if (aNamespaceID == kNameSpaceID_None) {
      // This should be the common case so lets make an optimized loop
      for (i = 0; i < slotCount && AttrSlotIsTaken(i); ++i) {
        if (ATTRS(mImpl)[i].mName.Equals(aLocalName)) {
          return &ATTRS(mImpl)[i].mValue;
        }
      }

      if (mImpl && mImpl->mMappedAttrs) {
        return mImpl->mMappedAttrs->GetAttr(aLocalName);
      }
    }
  ```

B-1: nsContentSink::ProcessOfflineManifest(nsIContent *aElement)
  ```cpp
    // Check for a manifest= attribute.
    nsAutoString manifestSpec;
    aElement->GetAttr(kNameSpaceID_None, nsGkAtoms::manifest, manifestSpec);
    ProcessOfflineManifest(manifestSpec); // Get the manifest, go to [B-2]
  ```

B-2: nsContentSink::ProcessOfflineManifest(const nsAString& aManifestSpec)
  ```cpp
    // Before proceeding to here, would went through checks of
    //  - if the document was intercepted by Service Worker, then skip processing appcache manifest
    //  - if in private browsing mode, then skip processing appcache manifest
    //  - if empty appcache manifest and no appcache, then skip processing appcache manifest
    //  - if no permission of offline APIs and no auto-granted permission, then skip processing appcache manifest.
    // Then go to [B-3].
    rv = SelectDocAppCache(applicationCache, manifestURI, fetchedWithHTTPGetOrEquiv, &action);
    if (NS_FAILED(rv)) {
      return;
    }
  ```

B-3: nsContentSink::SelectDocAppCache
  ```cpp
    // In this method, it would decide what action to take on the given appcache manifest.
    // For the 1st time met appcache (no applicationCache), the action would as below, then back to [B-2].
    *aAction = CACHE_SELECTION_UPDATE;
  ```

B-2: nsContentSink::ProcessOfflineManifest(const nsAString& aManifestSpec)
  ```cpp
    case CACHE_SELECTION_UPDATE: {
      nsCOMPtr<nsIOfflineCacheUpdateService> updateService =
        do_GetService(NS_OFFLINECACHEUPDATESERVICE_CONTRACTID);

      if (updateService) {
        nsCOMPtr<nsIDOMDocument> domdoc = do_QueryInterface(mDocument);
        // Go to [I-1]
        updateService->ScheduleOnDocumentStop(manifestURI, mDocumentURI, mDocument->NodePrincipal(), domdoc);
      }
      break;
    }
  ```

I-1: nsOfflineCacheUpdateService::ScheduleOnDocumentStop
  ```cpp
    // Proceed with cache update
    RefPtr<nsOfflineCachePendingUpdate> update = new nsOfflineCachePendingUpdate(this, aManifestURI, aDocumentURI, aLoadingPrincipal, aDocument);
    NS_ENSURE_TRUE(update, NS_ERROR_OUT_OF_MEMORY);

    // This would listent to document load state changes, which would invoke [J-1].
    nsresult rv = progress->AddProgressListener(update, nsIWebProgress::NOTIFY_STATE_DOCUMENT);
  ```

J-1: nsOfflineCachePendingUpdate::OnStateChange
  ```cpp
    nsCOMPtr<nsIDOMDocument> updateDoc = do_QueryReferent(mDocument);
    if (!updateDoc) {
        // The document that scheduled this update has gone away,
        // we don't need to listen anymore.
        aWebProgress->RemoveProgressListener(this);
        MOZ_ASSERT(!mDidReleaseThis);
        mDidReleaseThis = true;
        NS_RELEASE_THIS();
        return NS_OK;
    }
    // Proceed after document load stops
    if (!(progressStateFlags & STATE_STOP)) {
        return NS_OK;
    }

    // ......

    // Only schedule the update if the document loaded successfully
    if (NS_SUCCEEDED(aStatus)) {
        nsCOMPtr<nsIOfflineCacheUpdate> update;
        // Go to [I-2]
        mService->Schedule(mManifestURI, mDocumentURI, mLoadingPrincipal, updateDoc, innerWindow, nullptr, getter_AddRefs(update));
        if (mDidReleaseThis) {
            return NS_OK;
        }
    }
  ```

I-2: nsOfflineCacheUpdateService::Schedule
  ```cpp
    nsCOMPtr<nsIOfflineCacheUpdate> update;
    if (GeckoProcessType_Default != XRE_GetProcessType()) { // The content proccess
        // I-2-1: OfflineCacheUpdateChild::Schedule()
        update = new OfflineCacheUpdateChild(aWindow);
    }
    else {
        // I-2-2: OfflineCacheUpdateGlue::Schedule()
        update = new OfflineCacheUpdateGlue();
    }

    // .......

    // Invoke [I-2-1] or [I-2-2], then go to [L-1]
    rv = update->Init(aManifestURI, aDocumentURI, aLoadingPrincipal, aDocument, aCustomProfileDir);

    rv = update->Schedule();
  ```

L-1: nsOfflineCacheUpdate::Init(nsIURI *aManifestURI, nsIURI *aDocumentURI, nsIPrincipal* aLoadingPrincipal, nsIDOMDocument *aDocument, nsIFile *aCustomProfileDir)
  ```cpp
    rv = InitInternal(aManifestURI, aLoadingPrincipal); // Go to L-2
    NS_ENSURE_SUCCESS(rv, rv);
  ```

L-2: nsOfflineCacheUpdate::InitInternal(nsIURI *aManifestURI, nsIPrincipal* aLoadingPrincipal)
  ```cpp
    // Only http and https applications are supported.
    bool match;
    rv = aManifestURI->SchemeIs("http", &match);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!match) {
        rv = aManifestURI->SchemeIs("https", &match);
        NS_ENSURE_SUCCESS(rv, rv);
        if (!match)
            return NS_ERROR_ABORT;
    }

    // ......

    rv = mManifestURI->GetAsciiHost(mUpdateDomain); // Back to [L-1]
  ```

L-1: nsOfflineCacheUpdate::Init(nsIURI *aManifestURI, nsIURI *aDocumentURI, nsIPrincipal* aLoadingPrincipal, nsIDOMDocument *aDocument, nsIFile *aCustomProfileDir)
  ```cpp
    // ......

    nsAutoCString originSuffix;
    rv = aLoadingPrincipal->GetOriginSuffix(originSuffix);

    // ......

    if (aCustomProfileDir) {
      // ......
    } else {
      // Below cacheService is nsIApplicationCacheService

      // This would lead to [M-1]
      rv = cacheService->BuildGroupIDForSuffix(aManifestURI, originSuffix, mGroupID);
      NS_ENSURE_SUCCESS(rv, rv);

      rv = cacheService->GetActiveCache(mGroupID, getter_AddRefs(mPreviousApplicationCache));
      NS_ENSURE_SUCCESS(rv, rv);

      // This would lead to [M-2]
      rv = cacheService->CreateApplicationCache(mGroupID, getter_AddRefs(mApplicationCache));
      NS_ENSURE_SUCCESS(rv, rv);
    }
  ```

M-1: nsOfflineCacheDevice::BuildApplicationCacheGroupID(nsIURI *aManifestURL, nsACString const &aOriginSuffix, nsACString &_result)
  ```
    nsCOMPtr<nsIURI> newURI;
    nsresult rv = aManifestURL->CloneIgnoringRef(getter_AddRefs(newURI));
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoCString manifestSpec;
    rv = newURI->GetAsciiSpec(manifestSpec);
    NS_ENSURE_SUCCESS(rv, rv);

    // Here is the place building up appcache group Id, which is the uri to appcache.
    // Then, back to [L-1]
    _result.Assign(manifestSpec);
    _result.Append('#');
    _result.Append(aOriginSuffix);
  ```

M-2: nsOfflineCacheDevice::CreateApplicationCache(const nsACString &group, nsIApplicationCache **out)
  ```cpp
    // Include the timestamp to guarantee uniqueness across runs, and
    // the gNextTemporaryClientID for uniqueness within a second.
    clientID.Append(nsPrintfCString("|%016" PRId64 "|%d", now / PR_USEC_PER_SEC, gNextTemporaryClientID++));

    nsCOMPtr<nsIApplicationCache> cache = new nsApplicationCache(this, group, clientID);

    // ......

    MutexAutoLock lock(mLock);
    mCaches.Put(clientID, weak);

    cache.swap(*out); // Back to [L-1]
  ```

L-1: nsOfflineCacheUpdate::Init
  ```cpp
    rv = nsOfflineCacheUpdateService::OfflineAppPinnedForURI(aDocumentURI, nullptr, &mPinned);
    NS_ENSURE_SUCCESS(rv, rv);

    mState = STATE_INITIALIZED;
    return NS_OK; // Back to [I-2]
  ```

I-2: nsOfflineCacheUpdateService::Schedule
  ```cpp
    rv = update->Schedule(); // Eventually lead to [L-2]
  ```

L-2: nsOfflineCacheUpdate::Schedule()
  ```cpp
    return service->ScheduleUpdate(this); // Go to [I-3].
  ```

I-3: nsOfflineCacheUpdateService::ScheduleUpdate(nsOfflineCacheUpdate *aUpdate)
  ```cpp
    aUpdate->SetOwner(this);

    mUpdates.AppendElement(aUpdate);
    ProcessNextUpdate(); // Go to [I-4]
  ```

I-4: nsOfflineCacheUpdateService::ProcessNextUpdate()
  ```cpp
    if (mUpdates.Length() > 0) {
        mUpdateRunning = true;
        // Canceling the update before Begin() call will make the update
        // asynchronously finish with an error.
        if (mLowFreeSpace) {
            mUpdates[0]->Cancel();
        }
        return mUpdates[0]->Begin(); // Go to [L-3]
    }
  ```

L-3: nsOfflineCacheUpdate::Begin()
  ```cpp
    // Start checking the manifest.
    mManifestItem = new nsOfflineManifestItem(mManifestURI,
                                              mDocumentURI,
                                              mLoadingPrincipal,
                                              mApplicationCache,
                                              mPreviousApplicationCache);
    if (!mManifestItem) {
        return NS_ERROR_OUT_OF_MEMORY;
    }

    // ......

    nsresult rv = mManifestItem->OpenChannel(this); // Go to [N-1]
    if (NS_FAILED(rv)) {
        LoadCompleted(mManifestItem); // Go to [L-4]
    }
    return NS_OK;
  ```

N-1: nsOfflineCacheUpdateItem::OpenChannel(nsOfflineCacheUpdate *aUpdate)
  ```cpp
    // Here would open a http channel to start http request for manifest file and appcache resources.

    nsCOMPtr<nsIApplicationCacheChannel> appCacheChannel =
        do_QueryInterface(mChannel, &rv);

    // Support for nsIApplicationCacheChannel is required.
    NS_ENSURE_SUCCESS(rv, rv);

    // Use the existing application cache as the cache to check.
    rv = appCacheChannel->SetApplicationCache(mPreviousApplicationCache);
    NS_ENSURE_SUCCESS(rv, rv);

    // Set the new application cache as the target for write.
    rv = appCacheChannel->SetApplicationCacheForWrite(mApplicationCache);
    NS_ENSURE_SUCCESS(rv, rv);
    // configure HTTP specific stuff
    nsCOMPtr<nsIHttpChannel> httpChannel = do_QueryInterface(mChannel);
    if (httpChannel) {
        rv = httpChannel->SetReferrer(mReferrerURI);
        MOZ_ASSERT(NS_SUCCEEDED(rv));
        rv = httpChannel->SetRequestHeader(NS_LITERAL_CSTRING("X-Moz"),
                                           NS_LITERAL_CSTRING("offline-resource"),
                                           false);
        MOZ_ASSERT(NS_SUCCEEDED(rv));
    }

    // This would async trigger [N-2]
    rv = mChannel->AsyncOpen2(this);
    NS_ENSURE_SUCCESS(rv, rv);

    mUpdate = aUpdate;
    mState = LoadStatus::REQUESTED;
    return NS_OK; // Back to [L-3]
  ```


N-2: nsOfflineCacheUpdateItem::OnStopRequest
  ```cpp
    // We need to notify the update that the load is complete, but we
    // want to give the channel a chance to close the cache entries.
    NS_DispatchToCurrentThread(this); // Go to [N-3]
  ```

N-3: nsOfflineCacheUpdateItem::Run()
  ```cpp
    update->LoadCompleted(this); // Go to [L-4]
  ```


L-4: nsOfflineCacheUpdate::LoadCompleted(nsOfflineCacheUpdateItem *aItem)
  ```cpp
    // ......

    if (mState == STATE_CHECKING) { // Inside state checking manifest file
      // ......

      // A 404 or 410 is interpreted as an intentional removal of
      // the manifest file, rather than a transient server error.
      // Obsolete this cache group if one of these is returned.
      uint16_t status;
      rv = mManifestItem->GetStatus(&status);
      if (status == 404 || status == 410) {
          // ......
          Finish();
          return;
      }

      bool doUpdate;
      // Go to [L-5]
      if (NS_FAILED(HandleManifest(&doUpdate))) {
          mSucceeded = false;
          NotifyState(nsIOfflineCacheUpdateObserver::STATE_ERROR);
          Finish();
          return;
      }


      if (!doUpdate) {
        // ......
        // No need to update, bye!
        return;
      }}

      // Save appcache manifest resource. This is going to create an appcache entry inside DB,
      // which then leads to [M-3]
      rv = mApplicationCache->MarkEntry(mManifestItem->mCacheKey, mManifestItem->mItemType);

      // Switch to the state downloading appcache resources given by manifest
      mState = STATE_DOWNLOADING;
      NotifyState(nsIOfflineCacheUpdateObserver::STATE_DOWNLOADING);

      // Start fetching appcache resources given by manifest.
      ProcessNextURI();

      return;
    }

    // Below are codes processing appcache resources given by manifest......
  ```

L-5: nsOfflineCacheUpdate::HandleManifest(bool *aDoUpdate)
  ```cpp
    *aDoUpdate = false;

    bool succeeded;
    nsresult rv = mManifestItem->GetRequestSucceeded(&succeeded);
    NS_ENSURE_SUCCESS(rv, rv);

    // Don't update if getting or parsing manifest failed
    if (!succeeded || !mManifestItem->ParseSucceeded()) {
        return NS_ERROR_FAILURE;
    }

    // Don't update if no needs.
    // So for the 1st time of retrieving, always results in needing update
    if (!mManifestItem->NeedsUpdate()) {
        return NS_OK;
    }

    // Add appcache resources specified inside manifest into pending queue to procecss next
    // Add items requested by the manifest.
    const nsCOMArray<nsIURI> &manifestURIs = mManifestItem->GetExplicitURIs();
    for (int32_t i = 0; i < manifestURIs.Count(); i++) {
        rv = AddURI(manifestURIs[i], nsIApplicationCache::ITEM_EXPLICIT);
        NS_ENSURE_SUCCESS(rv, rv);
    }

    // Keep adding resources into pending queue to procecss next......

    // Tell outside, we need to do update, back to [L-4]
    *aDoUpdate = true;
    return NS_OK;
  ```

M-3: nsOfflineCacheDevice::MarkEntry(const nsCString &clientID, const nsACString &key, uint32_t typeBits)
  ```cpp
    // Assemble SQL statement
    AutoResetStatement statement(mStatement_MarkEntry);
    nsresult rv = statement->BindInt32ByIndex(0, typeBits);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = statement->BindUTF8StringByIndex(1, clientID);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = statement->BindUTF8StringByIndex(2, key);
    NS_ENSURE_SUCCESS(rv, rv);

    // Execute SQL, leading to [P-1]
    rv = statement->Execute();
  ```

P-1: Statement::ExecuteStep(bool *_moreResults)
  ```cpp
    // DB operation finally is reached!
    int srv = mDBConnection->stepStatement(mNativeConnection, mDBStatement);
  ```

