"""The three things a baseline run can mean, and keeping them distinguishable.

CI builds a small dataset and asserts that at least one arm beats chance. When
that assertion failed, the output was an empty table under a full header and
the sentence "No arm beat chance. Investigate data, labels and feature
plumbing before tuning anything."

The feature plumbing was correct. Every one of the 48 outputs had been skipped
for having a single class in a split, so no arm ever ran — a different failure
with a different fix, reported in the words of this one.
"""

from __future__ import annotations

from app.training.run_baselines import verdict


def test_something_learned_says_so():
    message = verdict(any_learned=True, evaluated=24, skipped=24, split="valid")
    assert "better than chance" in message


def test_nothing_evaluated_blames_the_dataset_not_the_features():
    """No arm ran. Sending someone to the feature plumbing wastes their day."""
    message = verdict(any_learned=False, evaluated=0, skipped=48, split="valid")
    assert "48" in message, "say how many outputs were unusable"
    assert "single class" in message or "one class" in message
    assert "dataset, not the features" in message
    assert "repeats" in message, "say what to actually do about it"
    assert "feature plumbing" not in message, (
        "this is the message that misdirected the investigation; it belongs "
        "only to the case where arms ran and lost."
    )


def test_arms_ran_and_lost_still_points_at_the_features():
    """The original message is right here, and must survive."""
    message = verdict(any_learned=False, evaluated=12, skipped=0, split="valid")
    assert "No arm beat chance" in message
    assert "feature plumbing" in message


def test_the_three_outcomes_are_all_different():
    messages = {
        verdict(any_learned=True, evaluated=24, skipped=0, split="valid"),
        verdict(any_learned=False, evaluated=0, skipped=48, split="valid"),
        verdict(any_learned=False, evaluated=12, skipped=0, split="valid"),
    }
    assert len(messages) == 3, "two outcomes render identically again"
