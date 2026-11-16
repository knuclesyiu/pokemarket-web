#!/usr/bin/env bash
# Give the functions a static outbound IP address.
#
# An Airwallex API key with an IP whitelist only works from a listed
# address. A serverless function's address changes with the instance,
# so the key either cannot be whitelisted at all or would break the
# next time a cold start lands on a different address.
#
# The route out is: Cloud Run -> VPC connector -> Cloud NAT -> the
# internet, with the NAT holding a reserved static address.
#
# Needs the gcloud CLI, logged in with an account that can edit the
# project, and the Serverless VPC Access and Cloud NAT APIs enabled:
#
#   gcloud services enable vpcaccess.googleapis.com compute.googleapis.com
#
# Run this once. It is not idempotent — re-running it fails on the
# resources that already exist, which is deliberate: nothing should
# silently replace a network that money moves through.
set -euo pipefail

PROJECT="${1:-pokemarket-255c6}"
REGION="${2:-us-central1}"

VPC="pm-egress-vpc"
SUBNET="pm-egress-subnet"
CONNECTOR="pm-egress-connector"
ADDRESS="pm-egress-ip"
ROUTER="pm-egress-router"
NAT="pm-egress-nat"

echo "════ 1. VPC ════"
gcloud compute networks create "$VPC" \
  --subnet-mode=custom --project="$PROJECT" >/dev/null

echo "════ 2. subnet ════"
gcloud compute networks subnets create "$SUBNET" \
  --network="$VPC" --region="$REGION" --range=10.8.0.0/24 \
  --project="$PROJECT" >/dev/null

echo "════ 3. VPC connector ════"
gcloud compute networks vpc-access connectors create "$CONNECTOR" \
  --network="$VPC" --region="$REGION" --range=10.8.16.0/28 \
  --project="$PROJECT" >/dev/null

echo "════ 4. 保留一個固定外部 IP ════"
gcloud compute addresses create "$ADDRESS" \
  --region="$REGION" --project="$PROJECT" >/dev/null

echo "════ 5. Cloud NAT ════"
gcloud compute routers create "$ROUTER" \
  --network="$VPC" --region="$REGION" --project="$PROJECT" >/dev/null
gcloud compute routers nats create "$NAT" \
  --router="$ROUTER" --region="$REGION" \
  --nat-external-ip-pool="$ADDRESS" \
  --nat-all-subnet-ip-ranges --enable-logging \
  --project="$PROJECT" >/dev/null

echo ""
echo "════ 固定 IP 地址 ════"
gcloud compute addresses describe "$ADDRESS" \
  --region="$REGION" --project="$PROJECT" \
  --format='value(address)' | tee /tmp/pm-static-egress-ip.txt
echo ""
echo "  → 呢個 IP 加去 Airwallex 嘅 API key 白名單（單一 IP /32 就夠）"
echo ""
echo "════ 之後要做 ════"
echo "  1. 喺 functions/src 嘅 Airwallex 相關 function 加上："
echo "       vpcConnector: '$CONNECTOR',"
echo "       vpcConnectorEgressSettings: 'ALL_TRAFFIC',"
echo "  2. cd functions && firebase deploy --only functions"
echo "  3. 撳 https://us-central1-$PROJECT.cloudfunctions.net/getEgressIp 睇 IP"
echo "     （撳多次都係同一個就 OK）"
