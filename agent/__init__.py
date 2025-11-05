"""
FDS Analytics Agent - ADK-based orchestration for restaurant analytics

This package contains the minimal ADK agent that orchestrates
calls to the Node.js Tool Server.
"""

from .agent import root_agent

__version__ = "2.0.0"
__all__ = ['root_agent']
