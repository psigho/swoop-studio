SRCPATH=.
prefix=/k/_tools/swoop-encoder-build-0.2.5/prefix
exec_prefix=${prefix}
bindir=${exec_prefix}/bin
libdir=${exec_prefix}/lib
includedir=${prefix}/include
SYS_ARCH=X86_64
SYS=WINDOWS
CC=gcc
CFLAGS=-Wno-maybe-uninitialized -Wshadow -O3 -ffast-math -m64  -Wall -I. -I$(SRCPATH) -O2 -D_POSIX_C_SOURCE=200112L -std=gnu99 -D_GNU_SOURCE -fomit-frame-pointer -fno-tree-vectorize -fvisibility=hidden
CFLAGSSO=
CFLAGSCLI=
COMPILER=GNU
COMPILER_STYLE=GNU
DEPCMD=
DEPFLAGS=-MMD -MF $(@:.o=.d)
LD=gcc -o 
LDFLAGS=-m64  -static -static-libgcc  -Wl,--high-entropy-va -Wl,--dynamicbase,--nxcompat,--tsaware
LDFLAGSCLI= -lshell32 -Wl,--image-base,0x140000000
LIBX264=libx264.a
CLI_LIBX264=$(LIBX264)
AR=gcc-ar rc 
RANLIB=gcc-ranlib
STRIP=strip
INSTALL=install
AS=nasm
ASFLAGS= -I. -I$(SRCPATH) -DARCH_X86_64=1 -I$(SRCPATH)/common/x86/ -f win64 -DSTACK_ALIGNMENT=16
RC=windres
RCFLAGS=--target=pe-x86-64  -I. -o 
EXE=.exe
HAVE_GETOPT_LONG=1
DEVNULL=NUL
PROF_GEN_CC=-fprofile-generate
PROF_GEN_LD=-fprofile-generate
PROF_USE_CC=-fprofile-use
PROF_USE_LD=-fprofile-use
HAVE_OPENCL=no
CC_O=-o $@
default: lib-static
install: install-lib-static
