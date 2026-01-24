import type { APIGatewayProxyEventV2 } from "aws-lambda";

export const mixedAssetsActivity: APIGatewayProxyEventV2 = {
  "version": "2.0",
  "routeKey": "POST /webhook/alchemy",
  "rawPath": "/webhook/alchemy",
  "rawQueryString": "",
  "headers": {
    "accept-encoding": "gzip,deflate",
    "content-length": "2399",
    "content-type": "application/json; charset=utf-8",
    "host": "nt9mhn1kvl.execute-api.us-east-1.amazonaws.com",
    "traceparent": "00-d627653b2dbd849d8049cb1dbbff1534-72af6eced5533b4f-01",
    "user-agent": "Apache-HttpClient/4.5.13 (Java/17.0.11)",
    "x-alchemy-signature": "e3b4cbbcb83e968a3558a71d111f1723caf90d9607fa147cd742dcec0cf4c599",
    "x-amzn-trace-id": "Root=1-696822fc-4b5070b362b840a303001c34",
    "x-api-key": "d601baa357e3f107e04c6d2a3d61d446fbe11d4ec4452e674f3ec37f6e415f54",
    "x-forwarded-for": "54.236.136.17",
    "x-forwarded-port": "443",
    "x-forwarded-proto": "https"
  },
  "requestContext": {
    "accountId": "547361936153",
    "apiId": "nt9mhn1kvl",
    "domainName": "nt9mhn1kvl.execute-api.us-east-1.amazonaws.com",
    "domainPrefix": "nt9mhn1kvl",
    "http": {
      "method": "POST",
      "path": "/webhook/alchemy",
      "protocol": "HTTP/1.1",
      "sourceIp": "54.236.136.17",
      "userAgent": "Apache-HttpClient/4.5.13 (Java/17.0.11)"
    },
    "requestId": "XMpnggBGIAMESEA=",
    "routeKey": "POST /webhook/alchemy",
    "stage": "$default",
    "time": "14/Jan/2026:23:13:00 +0000",
    "timeEpoch": 1768432380419
  },
  "body": "{\"webhookId\":\"wh_1di1wxjfoa323ead\",\"id\":\"whevt_5wbtyrup7ogzerre\",\"createdAt\":\"2026-01-14T23:13:00.344997399Z\",\"type\":\"ADDRESS_ACTIVITY\",\"event\":{\"network\":\"ETH_MAINNET\",\"activity\":[{\"blockNum\":\"0xdf34a3\",\"hash\":\"0x7a4a39da2a3fa1fc2ef88fd1eaea070286ed2aba21e0419dcfb6d5c5d9f02a72\",\"fromAddress\":\"0x503828976d22510aad0201ac7ec88293211d23da\",\"toAddress\":\"0xbe3f4b43db5eb49d1f48f53443b9abce45da3b79\",\"value\":293.092129,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"USDC\",\"category\":\"token\",\"rawContract\":{\"rawValue\":\"0x0000000000000000000000000000000000000000000000000000000011783b21\",\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"decimals\":6},\"typeTraceAddress\":null,\"log\":{\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x000000000000000000000000503828976d22510aad0201ac7ec88293211d23da\",\"0x000000000000000000000000be3f4b43db5eb49d1f48f53443b9abce45da3b79\"],\"data\":\"0x0000000000000000000000000000000000000000000000000000000011783b21\",\"blockNumber\":\"0xdf34a3\",\"transactionHash\":\"0x7a4a39da2a3fa1fc2ef88fd1eaea070286ed2aba21e0419dcfb6d5c5d9f02a72\",\"transactionIndex\":\"0x46\",\"blockHash\":\"0xa99ec54413bd3db3f9bdb0c1ad3ab1400ee0ecefb47803e17f9d33bc4d0a1e91\",\"logIndex\":\"0x6e\",\"removed\":false}},{\"blockNum\":\"0xdf34a35\",\"hash\":\"0xdeedbeefcafebabefeedfacefeed1234567890abcdefabcdefabcdefabcdef\",\"fromAddress\":\"0x1111111111111111111111111111111111111111\",\"toAddress\":\"0x2222222222222222222222222222222222222222\",\"value\":1.25,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"ETH\",\"category\":\"external\",\"rawContract\":{\"rawValue\":\"0x00000000000000000000000000000000000000000000000001158e460913d000\",\"address\":\"0x0000000000000000000000000000000000000000\",\"decimals\":18},\"typeTraceAddress\":null,\"log\":{\"address\":\"0x0000000000000000000000000000000000000000\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x0000000000000000000000001111111111111111111111111111111111111111\",\"0x0000000000000000000000002222222222222222222222222222222222222222\"],\"data\":\"0x\",\"blockNumber\":\"0xdf34a35\",\"transactionHash\":\"0xdeedbeefcafebabefeedfacefeed1234567890abcdefabcdefabcdefabcdef\",\"transactionIndex\":\"0x30\",\"blockHash\":\"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\",\"logIndex\":\"0x10\",\"removed\":false}},{\"blockNum\":\"0xdf34a3\",\"hash\":\"0xc84eeeb72d2b23161fd93b088f304902cbd8b4510f1455a65fdac160e37b3173\",\"fromAddress\":\"0x71660c4005ba85c37ccec55d0c4493e66fe775d3\",\"toAddress\":\"0x7853b3736edba9d7ce681f2a90264307694f97f2\",\"value\":2400,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"USDC\",\"category\":\"token\",\"rawContract\":{\"rawValue\":\"0x000000000000000000000000000000000000000000000000000000008f0d1800\",\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"decimals\":6},\"typeTraceAddress\":null,\"log\":{\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x00000000000000000000000071660c4005ba85c37ccec55d0c4493e66fe775d3\",\"0x0000000000000000000000007853b3736edba9d7ce681f2a90264307694f97f2\"],\"data\":\"0x000000000000000000000000000000000000000000000000000000008f0d1800\",\"blockNumber\":\"0xdf34a3\",\"transactionHash\":\"0xc84eeeb72d2b23161fd93b088f304902cbd8b4510f1455a65fdac160e37b3173\",\"transactionIndex\":\"0x48\",\"blockHash\":\"0xa99ec54413bd3db3f9bdb0c1ad3ab1400ee0ecefb47803e17f9d33bc4d0a1e91\",\"logIndex\":\"0x74\",\"removed\":false}},{\"blockNum\":\"0xdf34a4\",\"hash\":\"0x9f9e1aa8320c3ecddbe1ee790c91edc1f0e58dea0b35af6dbd8bf0cb3c6d4b11\",\"fromAddress\":\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"toAddress\":\"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"value\":4.5,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"ETH\",\"category\":\"external\",\"rawContract\":{\"rawValue\":\"0x0000000000000000000000000000000000000000000000000ad78ebc5ac62000\",\"address\":\"0x0000000000000000000000000000000000000000\",\"decimals\":18},\"typeTraceAddress\":null,\"log\":{\"address\":\"0x0000000000000000000000000000000000000000\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"],\"data\":\"0x\",\"blockNumber\":\"0xdf34a4\",\"transactionHash\":\"0x9f9e1aa8320c3ecddbe1ee790c91edc1f0e58dea0b35af6dbd8bf0cb3c6d4b11\",\"transactionIndex\":\"0x07\",\"blockHash\":\"0xe0f1f2f3f4f5060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\",\"logIndex\":\"0x02\",\"removed\":false}}]}}",
  "isBase64Encoded": false
}

export const noETHAssetActivity: APIGatewayProxyEventV2 = {
  "version": "2.0",
  "routeKey": "POST /webhook/alchemy",
  "rawPath": "/webhook/alchemy",
  "rawQueryString": "",
  "headers": {
    "accept-encoding": "gzip,deflate",
    "content-length": "2399",
    "content-type": "application/json; charset=utf-8",
    "host": "nt9mhn1kvl.execute-api.us-east-1.amazonaws.com",
    "traceparent": "00-d627653b2dbd849d8049cb1dbbff1534-72af6eced5533b4f-01",
    "user-agent": "Apache-HttpClient/4.5.13 (Java/17.0.11)",
    "x-alchemy-signature": "e3b4cbbcb83e968a3558a71d111f1723caf90d9607fa147cd742dcec0cf4c599",
    "x-amzn-trace-id": "Root=1-696822fc-4b5070b362b840a303001c34",
    "x-api-key": "d601baa357e3f107e04c6d2a3d61d446fbe11d4ec4452e674f3ec37f6e415f54",
    "x-forwarded-for": "54.236.136.17",
    "x-forwarded-port": "443",
    "x-forwarded-proto": "https"
  },
  "requestContext": {
    "accountId": "547361936153",
    "apiId": "nt9mhn1kvl",
    "domainName": "nt9mhn1kvl.execute-api.us-east-1.amazonaws.com",
    "domainPrefix": "nt9mhn1kvl",
    "http": {
      "method": "POST",
      "path": "/webhook/alchemy",
      "protocol": "HTTP/1.1",
      "sourceIp": "54.236.136.17",
      "userAgent": "Apache-HttpClient/4.5.13 (Java/17.0.11)"
    },
    "requestId": "XMpnggBGIAMESEA=",
    "routeKey": "POST /webhook/alchemy",
    "stage": "$default",
    "time": "14/Jan/2026:23:13:00 +0000",
    "timeEpoch": 1768432380419
  },
  "body": "{\"webhookId\":\"wh_1di1wxjfoa323ead\",\"id\":\"whevt_5wbtyrup7ogzerre\",\"createdAt\":\"2026-01-14T23:13:00.344997399Z\",\"type\":\"ADDRESS_ACTIVITY\",\"event\":{\"network\":\"ETH_MAINNET\",\"activity\":[{\"blockNum\":\"0xdf34a3\",\"hash\":\"0x7a4a39da2a3fa1fc2ef88fd1eaea070286ed2aba21e0419dcfb6d5c5d9f02a72\",\"fromAddress\":\"0x503828976d22510aad0201ac7ec88293211d23da\",\"toAddress\":\"0xbe3f4b43db5eb49d1f48f53443b9abce45da3b79\",\"value\":293.092129,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"USDC\",\"category\":\"token\",\"rawContract\":{\"rawValue\":\"0x0000000000000000000000000000000000000000000000000000000011783b21\",\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"decimals\":6},\"typeTraceAddress\":null,\"log\":{\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x000000000000000000000000503828976d22510aad0201ac7ec88293211d23da\",\"0x000000000000000000000000be3f4b43db5eb49d1f48f53443b9abce45da3b79\"],\"data\":\"0x0000000000000000000000000000000000000000000000000000000011783b21\",\"blockNumber\":\"0xdf34a3\",\"transactionHash\":\"0x7a4a39da2a3fa1fc2ef88fd1eaea070286ed2aba21e0419dcfb6d5c5d9f02a72\",\"transactionIndex\":\"0x46\",\"blockHash\":\"0xa99ec54413bd3db3f9bdb0c1ad3ab1400ee0ecefb47803e17f9d33bc4d0a1e91\",\"logIndex\":\"0x6e\",\"removed\":false}},{\"blockNum\":\"0xdf34a35\",\"hash\":\"0xdeedbeefcafebabefeedfacefeed1234567890abcdefabcdefabcdefabcdef\",\"fromAddress\":\"0x1111111111111111111111111111111111111111\",\"toAddress\":\"0x2222222222222222222222222222222222222222\",\"value\":1.25,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"USDC\",\"category\":\"external\",\"rawContract\":{\"rawValue\":\"0x00000000000000000000000000000000000000000000000001158e460913d000\",\"address\":\"0x0000000000000000000000000000000000000000\",\"decimals\":18},\"typeTraceAddress\":null,\"log\":{\"address\":\"0x0000000000000000000000000000000000000000\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x0000000000000000000000001111111111111111111111111111111111111111\",\"0x0000000000000000000000002222222222222222222222222222222222222222\"],\"data\":\"0x\",\"blockNumber\":\"0xdf34a35\",\"transactionHash\":\"0xdeedbeefcafebabefeedfacefeed1234567890abcdefabcdefabcdefabcdef\",\"transactionIndex\":\"0x30\",\"blockHash\":\"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\",\"logIndex\":\"0x10\",\"removed\":false}},{\"blockNum\":\"0xdf34a3\",\"hash\":\"0xc84eeeb72d2b23161fd93b088f304902cbd8b4510f1455a65fdac160e37b3173\",\"fromAddress\":\"0x71660c4005ba85c37ccec55d0c4493e66fe775d3\",\"toAddress\":\"0x7853b3736edba9d7ce681f2a90264307694f97f2\",\"value\":2400,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"USDC\",\"category\":\"token\",\"rawContract\":{\"rawValue\":\"0x000000000000000000000000000000000000000000000000000000008f0d1800\",\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"decimals\":6},\"typeTraceAddress\":null,\"log\":{\"address\":\"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x00000000000000000000000071660c4005ba85c37ccec55d0c4493e66fe775d3\",\"0x0000000000000000000000007853b3736edba9d7ce681f2a90264307694f97f2\"],\"data\":\"0x000000000000000000000000000000000000000000000000000000008f0d1800\",\"blockNumber\":\"0xdf34a3\",\"transactionHash\":\"0xc84eeeb72d2b23161fd93b088f304902cbd8b4510f1455a65fdac160e37b3173\",\"transactionIndex\":\"0x48\",\"blockHash\":\"0xa99ec54413bd3db3f9bdb0c1ad3ab1400ee0ecefb47803e17f9d33bc4d0a1e91\",\"logIndex\":\"0x74\",\"removed\":false}},{\"blockNum\":\"0xdf34a4\",\"hash\":\"0x9f9e1aa8320c3ecddbe1ee790c91edc1f0e58dea0b35af6dbd8bf0cb3c6d4b11\",\"fromAddress\":\"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"toAddress\":\"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\",\"value\":4.5,\"erc721TokenId\":null,\"erc1155Metadata\":null,\"asset\":\"USD\",\"category\":\"external\",\"rawContract\":{\"rawValue\":\"0x0000000000000000000000000000000000000000000000000ad78ebc5ac62000\",\"address\":\"0x0000000000000000000000000000000000000000\",\"decimals\":18},\"typeTraceAddress\":null,\"log\":{\"address\":\"0x0000000000000000000000000000000000000000\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\",\"0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"0x000000000000000000000000bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"],\"data\":\"0x\",\"blockNumber\":\"0xdf34a4\",\"transactionHash\":\"0x9f9e1aa8320c3ecddbe1ee790c91edc1f0e58dea0b35af6dbd8bf0cb3c6d4b11\",\"transactionIndex\":\"0x07\",\"blockHash\":\"0xe0f1f2f3f4f5060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\",\"logIndex\":\"0x02\",\"removed\":false}}]}}",
  "isBase64Encoded": false
}
