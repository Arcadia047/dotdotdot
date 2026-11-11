# Parallel OMP work

Language for local agent work and its completion evidence.

## Language

**Job**:
An authorized outcome with a particular repository, target branch, and acceptance criteria.

**Campaign**:
The coordinated execution of related tickets that deliver one job.

**Ticket**:
A self-contained piece of a job with explicit dependencies and acceptance criteria.

**Attempt**:
One execution of a worker assignment against a recorded starting point.

**Candidate**:
A recorded revision proposed for verification and review.

**Ready**:
A candidate whose required current validation and reviews pass with no unresolved blocking findings.
_Avoid_: done, ready-for-agent

**Blocked**:
Work that cannot progress within its current authorization, access, or repair budget and has a recorded reason.

**Integration branch**:
The branch where accepted related tickets are combined for a job.
