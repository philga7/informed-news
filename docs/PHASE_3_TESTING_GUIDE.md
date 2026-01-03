# Phase 3 Claims & Corroboration - Testing Guide

## Prerequisites

Before testing, ensure:

1. ✅ Database migration applied
2. ✅ Backend server running on port 3001
3. ✅ Frontend development server running
4. ✅ At least one organization with test data
5. ✅ At least one topic with 3-5 linked source records

## Setup Test Data

### Apply Database Migration

```bash
cd supabase
supabase db reset  # Development only
```

Or for production:

```bash
supabase db push
```

### Verify Migration

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('claims', 'claim_evidence');

-- Check helper functions
SELECT proname FROM pg_proc 
WHERE proname IN ('get_claim_corroboration_status', 'get_corroboration_matrix');
```

Expected output: 2 tables and 2 functions found.

## Testing Scenarios

### Test 1: Create Claims

**Objective**: Verify claim creation with different types

**Steps:**

1. Navigate to a topic detail page (e.g., `/topics/{topic-id}`)
2. Scroll to "Claims Analysis" section
3. Click "Add Claim" button

**Test Cases:**

#### 1.1 Factual Claim
- **Claim Text**: "The policy will be implemented in Q2 2026"
- **Claim Type**: Factual
- **Falsifiable**: ✅ Checked
- **Expected**: Claim created with blue "Factual" badge

#### 1.2 Assessment Claim
- **Claim Text**: "This initiative is likely to face strong opposition from stakeholders"
- **Claim Type**: Assessment
- **Falsifiable**: ✅ Checked
- **Expected**: Claim created with purple "Assessment" badge

#### 1.3 Prediction Claim
- **Claim Text**: "Adoption rates will exceed 50% by end of year"
- **Claim Type**: Prediction
- **Falsifiable**: ✅ Checked
- **Expected**: Claim created with orange "Prediction" badge

#### 1.4 Non-Falsifiable Claim
- **Claim Text**: "The project is important for national security"
- **Claim Type**: Assessment
- **Falsifiable**: ❌ Unchecked
- **Expected**: Claim created with "Non-falsifiable" badge

**Success Criteria:**
- ✅ All claims appear in Claims Analysis section
- ✅ Each claim shows correct type badge
- ✅ Claims display "No Evidence" status (gray)
- ✅ Created date is current

### Test 2: Link Evidence via Edit Modal

**Objective**: Test evidence linking through existing source record workflow

**Steps:**

1. Stay on the topic detail page
2. Scroll to "Linked Source Records" section
3. Click "Edit" button on a source record
4. Scroll to "Claims Addressed" section

**Test Cases:**

#### 2.1 Corroborating Evidence
- **Action**: Check the first claim checkbox
- **Support Status**: Click "Corroborates" (green)
- **Evidence Excerpt**: "According to the announcement, Q2 2026 is the target date"
- **Expected**: Green checkmark appears when saved

#### 2.2 Contradicting Evidence
- **Action**: Edit a different source record
- **Action**: Check the first claim
- **Support Status**: Click "Contradicts" (red)
- **Evidence Excerpt**: "Sources indicate timeline has been pushed to Q3 2026"
- **Expected**: Red X appears when saved

#### 2.3 Neutral Mention
- **Action**: Edit another source record
- **Action**: Check the second claim
- **Support Status**: Click "Mentions" (gray)
- **Evidence Excerpt**: "The proposal mentions stakeholder concerns"
- **Expected**: Gray dot appears when saved

**Success Criteria:**
- ✅ Claims list loads in modal
- ✅ Checkboxes toggle correctly
- ✅ Support buttons highlight selected state
- ✅ Evidence excerpt saves properly
- ✅ Evidence appears in Claims Analysis after save

### Test 3: Verify Corroboration Status

**Objective**: Test automatic corroboration status calculation

**Return to Claims Analysis section**

**Expected States:**

#### 3.1 Disputed Claim
- **Claim**: First claim (has both corroborating and contradicting evidence)
- **Status Badge**: Red "Disputed" with count
- **Evidence Summary**: Shows both supporting and contradicting sources
- **Icon**: Red X icon

#### 3.2 Single Source Claim
- **Claim**: Second claim (has only one piece of evidence)
- **Status Badge**: Yellow "Single Source"
- **Evidence Summary**: Shows one source
- **Icon**: Yellow warning triangle

#### 3.3 No Evidence Claim
- **Claim**: Any claim without linked evidence
- **Status Badge**: Gray "No Evidence"
- **Evidence Summary**: Empty or not shown
- **Icon**: Gray question mark

#### 3.4 Corroborated Claim (Setup Required)
**Setup**: Add corroborating evidence from 2+ sources to a claim
- **Status Badge**: Green "Corroborated" with count
- **Evidence Summary**: Shows multiple supporting sources
- **Icon**: Green checkmark

**Success Criteria:**
- ✅ Status badges update automatically
- ✅ Evidence counts are accurate
- ✅ Icons match status correctly
- ✅ Evidence list shows correct sources

### Test 4: Corroboration Matrix

**Objective**: Test matrix visualization and gap analysis

**Steps:**

1. Scroll to "Corroboration Matrix" section
2. Observe the matrix layout

**Test Cases:**

#### 4.1 Matrix Display
**Verify:**
- ✅ Claims appear as rows (left side)
- ✅ Sources appear as columns (top)
- ✅ Each cell shows correct indicator:
  - Green checkmark for corroborating
  - Red X for contradicting
  - Gray dash for no evidence
- ✅ Claim type labels visible under claim text
- ✅ Source names truncated but readable

#### 4.2 Interactive Features
**Actions:**
- Hover over cells with evidence
- **Expected**: Tooltip appears showing evidence excerpt
- Hover over cells without evidence
- **Expected**: No tooltip or generic message

#### 4.3 Gap Analysis Dashboard
**Verify statistics at bottom of matrix:**
- **Claims Without Evidence**: Matches count of claims with no linked evidence
- **Single-Source Claims**: Matches count of claims with exactly 1 corroborating source
- **Disputed Claims**: Matches count of claims with contradicting evidence

**Success Criteria:**
- ✅ Matrix renders correctly
- ✅ Cell indicators are accurate
- ✅ Tooltips show correct excerpts
- ✅ Gap analysis numbers are correct
- ✅ Layout is responsive (test on smaller screen)

### Test 5: Update and Delete Claims

**Objective**: Test claim lifecycle management

**Steps:**

#### 5.1 Delete Evidence
1. Edit a source record link
2. Uncheck a previously checked claim
3. Save changes
4. **Expected**: Evidence removed from Claims Analysis

#### 5.2 Update Evidence
1. Edit a source record link
2. Change support status (e.g., from Corroborates to Contradicts)
3. Update evidence excerpt
4. Save changes
5. **Expected**: 
   - Status updates in Claims Analysis
   - Excerpt reflects new text
   - Matrix cell indicator changes

#### 5.3 Delete Claim
1. In Claims Analysis, click trash icon on a claim
2. Confirm deletion
3. **Expected**:
   - Claim removed from list
   - All evidence deleted (cascade)
   - Matrix updates to remove claim row

**Success Criteria:**
- ✅ Evidence can be removed
- ✅ Evidence can be updated
- ✅ Claims can be deleted
- ✅ Cascading deletes work correctly
- ✅ UI updates reflect changes

### Test 6: Edge Cases

#### 6.1 No Claims Scenario
**Setup**: Delete all claims from a topic
**Expected**: 
- Empty state in Claims Analysis
- "Add First Claim" button
- Matrix shows "No Matrix Data" message

#### 6.2 No Sources Scenario
**Setup**: Topic with claims but no linked sources
**Expected**:
- Claims show "No Evidence" status
- Matrix shows "Add claims and link sources" message

#### 6.3 Many Claims (Performance)
**Setup**: Create 20+ claims with evidence
**Expected**:
- Claims list scrollable
- Matrix renders without lag
- Evidence modal scrollable in "Claims Addressed" section

#### 6.4 Long Claim Text
**Setup**: Create claim with 500+ character text
**Expected**:
- Text truncates with ellipsis in matrix
- Full text visible in Claims Analysis
- Modal displays full text

#### 6.5 Special Characters
**Setup**: Claim with quotes, apostrophes, line breaks
**Expected**:
- Text renders correctly
- No SQL injection issues
- Escaping handled properly

**Success Criteria:**
- ✅ Empty states display correctly
- ✅ Performance acceptable with many claims
- ✅ Long text handled gracefully
- ✅ Special characters don't break UI

### Test 7: Multi-User Scenarios

**Objective**: Test RLS and organization isolation

**Prerequisites**: Two users in different organizations

#### 7.1 Organization Isolation
**Setup**: 
- User A creates claims in Org A's topic
- User B views Org B's topics
**Expected**: User B cannot see User A's claims

#### 7.2 Same Organization
**Setup**:
- User A creates claims
- User B (same org) views topic
**Expected**: User B sees all claims from User A

#### 7.3 Evidence Attribution
**Test**: Check `created_by_user_id` is set correctly
**Expected**: Claims and evidence track creator

**Success Criteria:**
- ✅ RLS policies enforce organization boundaries
- ✅ Users in same org can collaborate
- ✅ User attribution is tracked

## API Testing

### Test Backend Endpoints Directly

```bash
# Set your API base URL
API_BASE="http://localhost:3001"
TOPIC_ID="your-topic-uuid"

# 1. Get claims for topic
curl "${API_BASE}/api/claims?topic_id=${TOPIC_ID}"

# 2. Create a claim
curl -X POST "${API_BASE}/api/claims" \
  -H "Content-Type: application/json" \
  -d '{
    "topic_id": "'${TOPIC_ID}'",
    "claim_text": "Test claim from API",
    "claim_type": "factual",
    "is_falsifiable": true
  }'

# 3. Get corroboration matrix
curl "${API_BASE}/api/claims/topic/${TOPIC_ID}/matrix"
```

**Expected Responses:**
- ✅ Status 200 OK
- ✅ Valid JSON structure
- ✅ Data matches database

## Performance Benchmarks

### Acceptable Thresholds

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| Load claims | < 500ms | 1s |
| Create claim | < 300ms | 800ms |
| Add evidence | < 300ms | 800ms |
| Load matrix | < 1s | 2s |
| Edit modal open | < 400ms | 1s |

### Load Testing

```bash
# Use Apache Bench for basic load testing
ab -n 100 -c 10 "http://localhost:3001/api/claims?topic_id=${TOPIC_ID}"
```

**Success Criteria:**
- ✅ No errors under normal load
- ✅ Response times within acceptable range
- ✅ No memory leaks over extended use

## Browser Compatibility

Test on:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)

Verify:
- Matrix displays correctly
- Modals function properly
- Interactive elements work
- No console errors

## Accessibility Testing

### Keyboard Navigation
- ✅ Tab through form fields
- ✅ Enter to submit
- ✅ Escape to close modals

### Screen Reader
- ✅ Form labels are announced
- ✅ Status badges have descriptive text
- ✅ Matrix cells have aria-labels

### Visual
- ✅ Sufficient color contrast
- ✅ Focus indicators visible
- ✅ Text readable at 200% zoom

## Regression Testing

Ensure Phase 3 didn't break existing features:

### Topic Management
- ✅ Create/edit/delete topics still works
- ✅ Status changes work
- ✅ Collection plans work

### Source Linking
- ✅ Link record modal works
- ✅ Edit link (non-claims fields) works
- ✅ Unlink records works

### Analysis Features
- ✅ Timeline charts render
- ✅ Coordination detection works
- ✅ QA checklist works

## Bug Report Template

If you find issues, report using this format:

```markdown
## Bug Report

**Title**: Brief description

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**:

**Actual Behavior**:

**Screenshots**: (if applicable)

**Environment**:
- Browser: 
- OS: 
- API URL: 

**Console Errors**: (check browser console)
```

## Success Criteria Summary

Phase 3 passes testing if:

- ✅ All 7 test scenarios pass
- ✅ No critical bugs found
- ✅ Performance within acceptable thresholds
- ✅ RLS policies working correctly
- ✅ No console errors
- ✅ Cross-browser compatible
- ✅ No regression issues

## Next Steps After Testing

1. **Document Issues**: Create list of bugs found
2. **Prioritize Fixes**: Critical > High > Medium > Low
3. **User Training**: Create user guide if testing passes
4. **Production Deployment**: Plan migration for production database
5. **Monitor**: Set up logging/monitoring for claims endpoints

## Support Resources

- Implementation Doc: `docs/PHASE_3_CLAIMS_CORROBORATION_IMPLEMENTATION.md`
- Database Schema: `supabase/migrations/20250106000001_claims_corroboration.sql`
- Backend Routes: `backend/src/routes/claims.ts`
- Frontend Service: `src/services/claims.service.ts`

