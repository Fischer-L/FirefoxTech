## Call an nsIQuotaManagerService API

- JS requets to clear quota usage under one origin through `nsIQuotaManagerService::clearStoragesForPrincipal` api

- `QuotaManagerService::ClearStoragesForPrincipal` (api implementation) would receive the call.
  - Prepare the Clear Origin request 
    ```cpp
      // Prepare the Clear Origin request 
      RefPtr<Request> request = new Request(aPrincipal);
      ClearOriginParams params;
    ```
  
  - Initiate the request
    ```cpp
      nsAutoPtr<PendingRequestInfo> info(new RequestInfo(request, params));
      rv = InitiateRequest(info);
    ```

- QuotaManagerService::RequestInfo::InitiateRequest
  - Create the requet actor
    ```cpp
      auto actor = new QuotaRequestChild(request);
    ```
    
  - Send out the requet actor to Parent through IPC
    ```cpp
      // This is done by `PQuotaChild::SendPQuotaRequestConstructor`
      aActor->SendPQuotaRequestConstructor(actor, mParams)
    ```
    
- Quota::RecvPQuotaUsageRequestConstructor
  - Parent receives the request and runs it
    ```cpp
      auto* op = static_cast<QuotaUsageRequestBase*>(aActor);
      // ... ...
      op->RunImmediately();
    ```
    
- NormalOriginOperationBase::RunImmediately

- OriginOperationBase::Run
  
  OriginOperationBase would do task according the current state as well as advance the state after doing task.
  For exmaple, if we started at the State_DirectoryOpenPending.
  
  - OriginOperationBase::Run
    ```cpp
        case State_DirectoryOpenPending: {
          rv = DirectoryOpen();
          break;
        }
    ```

 - OriginOperationBase::DirectoryOpen
   - Advance to the next state
     ```cpp
      AdvanceState();
     ```
     
   - OriginOperationBase::AdvanceState
     - Advance State_DirectoryOpenPending to State_DirectoryWorkOpen
       ```cpp
          case State_DirectoryOpenPending:
            mState = State_DirectoryWorkOpen;
            return;
       ```
       
   - Dispatch to the IO thread to handle the new state
    ```cpp
      nsresult rv = quotaManager->IOThread()->Dispatch(this, NS_DISPATCH_NORMAL);
    ```
    
  - OriginOperationBase::Run
    ```cpp
        case State_DirectoryWorkOpen: {
          // The same, inside `DirectoryWork` after jobs are done,
          // the state would be advanced and dispatch to the IO thread to run the new state again.
          rv = DirectoryWork();
          break;
        }
    ```
    
- OriginOperationBase::DirectoryWork

  After advancing state, it would arrive this metod.
  
  - Ensure storage initialized then do directory work
    ```cpp
      if (mNeedsQuotaManagerInit) {
        rv = quotaManager->EnsureStorageIsInitialized();
        if (NS_WARN_IF(NS_FAILED(rv))) {
          return rv;
        }
      }
    
      // ... ...
      
      rv = DoDirectoryWork(quotaManager);
    ```
    
- ClearRequestBase::DoDirectoryWork (How did it know `ClearRequestBase`)
 
- ClearRequestBase::DeleteFiles
  - Init the path to the storage dir for a particular persistent type
    ```cpp
      rv = directory->InitWithPath(aQuotaManager->GetStoragePath(aPersistenceType));
    ```
    
  - Get entries under the storage dir
    ```cpp
      nsCOMPtr<nsISimpleEnumerator> entries;
      if (NS_WARN_IF(NS_FAILED(
            directory->GetDirectoryEntries(getter_AddRefs(entries)))) || !entries) {
        return;
      }
    ```
    
  - Find the matched origin then remove its storage directory
    ```cpp
      nsString leafName;
      rv = file->GetLeafName(leafName);
      
      // ... ...
      
      
      if (!isDirectory) {
        // Unknown files during clearing are allowed. Just warn if we find them.
        if (!IsOSMetadata(leafName)) {
          UNKNOWN_FILE_WARNING(leafName);
        }
        continue;
      }
      
      // Skip the origin directory if it doesn't match the pattern.
      if (!originScope.MatchesOrigin(OriginScope::FromOrigin(
                                       NS_ConvertUTF16toUTF8(leafName)))) {
        continue;
      }
      
      // ... ...
      
       for (uint32_t index = 0; index < 10; index++) {
         // We can't guarantee that this will always succeed on Windows...
         if (NS_SUCCEEDED((rv = file->Remove(true)))) {
           break;
         }
         // ... ...
       }
       
       // ... ...
       
       aQuotaManager->OriginClearCompleted(aPersistenceType, origin);
    ```
    
- OriginOperationBase::DirectoryWork

  Back to `DirectoryWork` then the state is advacned from "State_DirectoryWorkOpen" to "State_UnblockingOpen" 

- OriginOperationBase::Run
  - Unblock lock
    ```cpp
        case State_UnblockingOpen: {
          UnblockOpen();
          return NS_OK;
        }
    ```
  
- NormalOriginOperationBase::UnblockOpen
  - Send results
    ```cpp
      SendResults();
    ```
  
  - After sending results, release the lock then advance the state from "State_UnblockingOpen" to "State_Complete"
    ```cpp
      mDirectoryLock = nullptr;
      AdvanceState();
    ```
    
- QuotaRequestBase::SendResults (continues from the above `SendResults`)
  - Send result back to Child through IPC
    ```cpp
      Unused << PQuotaRequestParent::Send__delete__(this, response);
    ```

- QuotaRequestChild::Recv__delete__
  - Handle response from clearing job
    ```cpp
        case RequestResponse::TInitResponse:
        case RequestResponse::TClearOriginResponse:
        case RequestResponse::TClearDataResponse:
        case RequestResponse::TClearAllResponse:
        case RequestResponse::TResetAllResponse:
        case RequestResponse::TPersistResponse:
          HandleResponse();
          break;
    ```
    
- QuotaRequestChild::HandleResponse
  ```cpp
    mRequest->SetResult(variant)
  ```
 
- Request::SetResult
  ```cpp
    FireCallback();
  ```
  
- Request::FireCallback
  - Fire nsIQuotaRequest::nsIQuotaCallback::onComplete to send result back to JS side
    ```cpp
      if (mCallback) {
        mCallback->OnComplete(this);
        // Clean up.
        mCallback = nullptr;
      }
    ```
    
    
