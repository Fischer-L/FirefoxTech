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
  
  - 
